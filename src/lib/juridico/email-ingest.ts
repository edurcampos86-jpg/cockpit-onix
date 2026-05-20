import "server-only";
import { google } from "googleapis";
import { prisma } from "../prisma";
import {
  getGoogleClientForUser,
  recordGoogleAuthError,
  touchGoogleAuthUsage,
  GoogleNotConnectedError,
} from "../integrations/google-user-oauth";
import { registrarUploadContrato } from "../juridico";

/**
 * Ingestão de contratos PDF a partir de anexos de email (Gmail API).
 *
 * Por que email e não OneDrive: o tenant Microsoft 365 da Onix é
 * gerenciado pelo BTG, que bloqueia registro de App no Azure AD (logo
 * Microsoft Graph não dá). A solução: capturar os PDFs no momento em que
 * a plataforma de assinatura (Clicksign, DocuSign, etc) dispara o email
 * de "documento assinado" pro Eduardo.
 *
 * Workflow:
 *  1. Lista emails que casam o filtro (remetente + has:attachment + sem
 *     label já processado)
 *  2. Pra cada um, baixa anexos PDF
 *  3. Passa pelo registrarUploadContrato (hash dedup, B2, extração Claude)
 *  4. Marca IngestaoEmail.status (processado | duplicata | ignorado | erro)
 *
 * Idempotência:
 *  - DB: IngestaoEmail.gmailMessageId unique — não reprocessa mesma msg
 *  - Pipeline: ContratoArquivo.hashSha256 unique — mesmo PDF nunca duplica
 *    no B2/cofre, mesmo que venha em 2 emails diferentes
 */

// Remetentes conhecidos. Sufixos checados case-insensitive contra o
// header From: completo. Configurável via env JURIDICO_REMETENTES_CSV
// pra Eduardo adicionar novos sem deploy de código.
const REMETENTES_HARDCODED = [
  "clicksign.com.br",
  "clicksign.com",
  "docusign.net",
  "docusignmail.com",
  "docusign.com",
  "adobesign.com",
  "echosign.com",
  "echosign.adobe.com",
  "signaturit.com",
  "zapsign.com.br",
];

function listaRemetentes(): string[] {
  const extra = process.env.JURIDICO_REMETENTES_CSV;
  if (!extra) return REMETENTES_HARDCODED;
  const parsed = extra
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...REMETENTES_HARDCODED, ...parsed])];
}

function remetenteCasa(from: string | undefined): { ok: boolean; sufixo?: string } {
  if (!from) return { ok: false };
  const lower = from.toLowerCase();
  for (const sufixo of listaRemetentes()) {
    if (lower.includes(sufixo)) return { ok: true, sufixo };
  }
  return { ok: false };
}

type GmailAttachment = {
  filename: string;
  attachmentId: string;
  mimeType: string;
};

// Tipo recursivo simplificado dos parts de uma mensagem Gmail.
type GmailPart = {
  filename?: string | null;
  mimeType?: string | null;
  body?: { attachmentId?: string | null } | null;
  parts?: GmailPart[] | null;
};

function coletarAnexos(parts: GmailPart[] | null | undefined): GmailAttachment[] {
  if (!parts) return [];
  const out: GmailAttachment[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (part.parts && part.parts.length > 0) {
      out.push(...coletarAnexos(part.parts));
    }
    if (part.filename && part.body?.attachmentId) {
      out.push({
        filename: part.filename,
        attachmentId: part.body.attachmentId,
        mimeType: part.mimeType || "application/octet-stream",
      });
    }
  }
  return out;
}

function headersMap(
  headers: Array<{ name?: string | null; value?: string | null }> | undefined,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name) map[h.name.toLowerCase()] = h.value ?? "";
  }
  return map;
}

export type IngestResult = {
  totalEmailsConsultados: number;
  processados: number;
  duplicatasHash: number;
  duplicatasEmail: number;
  ignoradosSemPdf: number;
  ignoradosRemetente: number;
  erros: number;
  detalhes: Array<{
    gmailMessageId: string;
    remetente?: string;
    assunto?: string;
    status: string;
    contratoArquivoId?: string;
  }>;
};

export type IngestOptions = {
  /** Query Gmail manual (sobrescreve as defaults). Útil pra backfill. */
  query?: string;
  /** Máximo de mensagens a processar nessa execução. Default 50. */
  limit?: number;
  /** Se true, pega TUDO (sem filtro de data). Default false. */
  backfill?: boolean;
  /** Janela em dias pra o cron normal. Default 1 dia. */
  janelaDias?: number;
};

export async function rodarIngestaoEmail(
  userId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const result: IngestResult = {
    totalEmailsConsultados: 0,
    processados: 0,
    duplicatasHash: 0,
    duplicatasEmail: 0,
    ignoradosSemPdf: 0,
    ignoradosRemetente: 0,
    erros: 0,
    detalhes: [],
  };

  let client;
  try {
    client = await getGoogleClientForUser(userId);
  } catch (e) {
    if (e instanceof GoogleNotConnectedError) {
      result.erros = 1;
      result.detalhes.push({
        gmailMessageId: "—",
        status: "erro_oauth",
        assunto: "Google não conectado pro userId " + userId,
      });
      return result;
    }
    throw e;
  }

  const gmail = google.gmail({ version: "v1", auth: client });
  const remetentes = listaRemetentes();

  // Query Gmail. Sintaxe: from:({lista OR}) has:attachment newer_than:Nd
  // No backfill, sem newer_than (pega tudo).
  const filtroFrom = `from:(${remetentes.map((r) => r).join(" OR ")})`;
  const baseQuery = opts.query
    ? opts.query
    : opts.backfill
      ? `${filtroFrom} has:attachment`
      : `${filtroFrom} has:attachment newer_than:${opts.janelaDias ?? 1}d`;

  const limit = Math.min(opts.limit ?? 50, 200);

  let pageToken: string | undefined;
  const messageIds: string[] = [];

  do {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: baseQuery,
      maxResults: Math.min(100, limit - messageIds.length),
      pageToken,
    });
    await touchGoogleAuthUsage(userId).catch(() => {});

    for (const m of list.data.messages ?? []) {
      if (m.id) messageIds.push(m.id);
    }
    pageToken = list.data.nextPageToken ?? undefined;
  } while (pageToken && messageIds.length < limit);

  result.totalEmailsConsultados = messageIds.length;

  // Pré-filtrar IDs já processados (lookup batch — evita 1 query por msg)
  const jaProcessados = await prisma.ingestaoEmail.findMany({
    where: { gmailMessageId: { in: messageIds } },
    select: { gmailMessageId: true },
  });
  const setJaProcessados = new Set(jaProcessados.map((x) => x.gmailMessageId));

  for (const id of messageIds) {
    if (setJaProcessados.has(id)) {
      result.duplicatasEmail++;
      continue;
    }

    let det;
    try {
      det = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
    } catch (e) {
      result.erros++;
      result.detalhes.push({
        gmailMessageId: id,
        status: "erro_fetch",
        assunto: (e as Error).message.slice(0, 200),
      });
      await prisma.ingestaoEmail.create({
        data: {
          gmailMessageId: id,
          userId,
          remetente: "?",
          status: "erro",
          motivo: `Falha no fetch: ${(e as Error).message}`,
        },
      });
      continue;
    }

    const msg = det.data;
    const headers = headersMap(msg.payload?.headers ?? undefined);
    const from = headers["from"];
    const subject = headers["subject"];
    const dateHeader = headers["date"];
    const internal = msg.internalDate ? new Date(Number(msg.internalDate)) : null;

    const casa = remetenteCasa(from);
    if (!casa.ok) {
      result.ignoradosRemetente++;
      await prisma.ingestaoEmail.create({
        data: {
          gmailMessageId: id,
          gmailThreadId: msg.threadId ?? null,
          userId,
          remetente: from ?? "?",
          assunto: subject ?? null,
          emailDate: dateHeader ? new Date(dateHeader) : null,
          internalDate: internal,
          status: "ignorado_remetente",
          motivo: `From não casou com lista (${from})`,
        },
      });
      continue;
    }

    const anexos = coletarAnexos((msg.payload?.parts ?? undefined) as GmailPart[] | undefined);
    const pdfs = anexos.filter(
      (a) =>
        a.mimeType === "application/pdf" ||
        a.filename.toLowerCase().endsWith(".pdf"),
    );

    if (pdfs.length === 0) {
      result.ignoradosSemPdf++;
      await prisma.ingestaoEmail.create({
        data: {
          gmailMessageId: id,
          gmailThreadId: msg.threadId ?? null,
          userId,
          remetente: from ?? "?",
          assunto: subject ?? null,
          emailDate: dateHeader ? new Date(dateHeader) : null,
          internalDate: internal,
          status: "ignorado_sem_anexo_pdf",
          motivo: `Nenhum anexo PDF (anexos: ${anexos.length})`,
        },
      });
      continue;
    }

    // Pra cada PDF anexo, processa
    for (const pdf of pdfs) {
      try {
        const att = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: id,
          id: pdf.attachmentId,
        });

        const data = att.data.data;
        if (!data) {
          result.erros++;
          continue;
        }

        const buffer = Buffer.from(data, "base64");
        const upload = await registrarUploadContrato({
          buffer,
          nomeOriginal: pdf.filename,
          mimeType: "application/pdf",
          uploadedById: userId,
          origemImportacao: "email_gmail",
          observacoes: `Ingestado do Gmail: from=${from ?? "?"} | subject=${subject ?? "?"} | message=${id}`,
        });

        if (!upload.ok) {
          result.erros++;
          await prisma.ingestaoEmail.create({
            data: {
              gmailMessageId: id,
              gmailThreadId: msg.threadId ?? null,
              userId,
              remetente: from ?? "?",
              assunto: subject ?? null,
              emailDate: dateHeader ? new Date(dateHeader) : null,
              internalDate: internal,
              nomeAnexoPdf: pdf.filename,
              status: "erro",
              motivo: upload.erro,
            },
          });
          result.detalhes.push({
            gmailMessageId: id,
            remetente: from,
            assunto: subject,
            status: "erro:" + upload.erro,
          });
        } else if (upload.jaExistia) {
          result.duplicatasHash++;
          await prisma.ingestaoEmail.create({
            data: {
              gmailMessageId: id,
              gmailThreadId: msg.threadId ?? null,
              userId,
              remetente: from ?? "?",
              assunto: subject ?? null,
              emailDate: dateHeader ? new Date(dateHeader) : null,
              internalDate: internal,
              nomeAnexoPdf: pdf.filename,
              contratoArquivoId: upload.contratoArquivoId,
              status: "duplicata_hash",
              motivo: "PDF já existia no cofre (dedup por SHA-256)",
            },
          });
        } else {
          result.processados++;
          await prisma.ingestaoEmail.create({
            data: {
              gmailMessageId: id,
              gmailThreadId: msg.threadId ?? null,
              userId,
              remetente: from ?? "?",
              assunto: subject ?? null,
              emailDate: dateHeader ? new Date(dateHeader) : null,
              internalDate: internal,
              nomeAnexoPdf: pdf.filename,
              contratoArquivoId: upload.contratoArquivoId,
              status: "processado",
            },
          });
          result.detalhes.push({
            gmailMessageId: id,
            remetente: from,
            assunto: subject,
            status: "processado",
            contratoArquivoId: upload.contratoArquivoId,
          });
        }
      } catch (e) {
        result.erros++;
        const err = e as Error;
        await prisma.ingestaoEmail.create({
          data: {
            gmailMessageId: id,
            gmailThreadId: msg.threadId ?? null,
            userId,
            remetente: from ?? "?",
            assunto: subject ?? null,
            emailDate: dateHeader ? new Date(dateHeader) : null,
            internalDate: internal,
            nomeAnexoPdf: pdf.filename,
            status: "erro",
            motivo: err.message,
          },
        });
      }
    }
  }

  return result;
}

/**
 * Encontra todos os Users que têm Gmail OAuth conectado.
 * O cron roda pra cada um deles — em geral só Eduardo, mas o sistema
 * já suporta múltiplos.
 */
export async function listarUsuariosComGmail(): Promise<string[]> {
  const auths = await prisma.userGoogleAuth.findMany({
    select: { userId: true },
  });
  return auths.map((a) => a.userId);
}

/**
 * Wrapper que avisa o Eduardo se a auth Google expirou.
 */
export async function rodarComLogDeErro(
  userId: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  try {
    return await rodarIngestaoEmail(userId, opts);
  } catch (e) {
    const err = e as Error & { code?: number };
    if (err.message?.includes("invalid_grant")) {
      await recordGoogleAuthError(userId, "invalid_grant — reconectar /integracoes");
    }
    throw e;
  }
}
