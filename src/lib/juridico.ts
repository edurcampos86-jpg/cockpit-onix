import "server-only";
import crypto from "node:crypto";
import { prisma } from "./prisma";
import { uploadContrato, moveContrato } from "./b2/upload";
import { extrairDadosContrato } from "./parser/contrato";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Camada de orquestração do módulo Jurídico (Fase 1A).
 *
 * Fluxo do upload:
 *  1. Validar PDF (tamanho, mime já checados na rota)
 *  2. Hash SHA-256 → dedup
 *  3. Upload no B2 com key pendentes-revisao/<cuid>.pdf
 *  4. Persistir ContratoArquivo
 *  5. Disparar extração assíncrona (não bloqueia o response)
 *
 * Em prod, o "assíncrono" usa só fire-and-forget no event loop do worker
 * Next.js. Pra Fase 1B/2 vale considerar fila dedicada (Inngest, BullMQ) —
 * mas pro volume atual (uns 30 contratos no passivo + 1-2/semana novos) o
 * fire-and-forget basta.
 */

export const TAMANHO_MAXIMO_PDF_BYTES = 20 * 1024 * 1024;

export type UploadInput = {
  buffer: Buffer;
  nomeOriginal: string;
  mimeType: string;
  uploadedById: string;
  pessoaId?: string | null;
  acordoComercialId?: string | null;
  origemImportacao?: string;
  observacoes?: string | null;
};

export type UploadResult =
  | {
      ok: true;
      contratoArquivoId: string;
      jaExistia: false;
    }
  | {
      ok: true;
      contratoArquivoId: string;
      jaExistia: true;
      mensagem: string;
    }
  | {
      ok: false;
      erro: string;
      status: number;
    };

export function hashSha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function pendenteKey(id: string): string {
  return `pendentes-revisao/${id}.pdf`;
}

export function aprovadoKey(pessoaId: string, id: string): string {
  return `pessoas/${pessoaId}/${id}.pdf`;
}

export function semVinculoKey(id: string): string {
  return `aprovados/sem-pessoa/${id}.pdf`;
}

export async function registrarUploadContrato(input: UploadInput): Promise<UploadResult> {
  if (input.mimeType !== "application/pdf") {
    return { ok: false, erro: "Apenas PDF é aceito (mime application/pdf)", status: 400 };
  }
  if (input.buffer.length === 0) {
    return { ok: false, erro: "Arquivo vazio", status: 400 };
  }
  if (input.buffer.length > TAMANHO_MAXIMO_PDF_BYTES) {
    return {
      ok: false,
      erro: `Arquivo excede ${TAMANHO_MAXIMO_PDF_BYTES / 1024 / 1024}MB`,
      status: 400,
    };
  }

  const hash = hashSha256(input.buffer);

  // Dedup pelo hash — mesmo conteúdo nunca é armazenado 2x.
  const existing = await prisma.contratoArquivo.findUnique({
    where: { hashSha256: hash },
    select: { id: true, status: true, nomeOriginal: true },
  });
  if (existing) {
    return {
      ok: true,
      contratoArquivoId: existing.id,
      jaExistia: true,
      mensagem: `Arquivo idêntico já existe no cofre (${existing.nomeOriginal}, status: ${existing.status})`,
    };
  }

  // Cria o registro primeiro (sem b2Key ainda) pra ter o cuid antes do upload.
  // Se o upload falhar, deletamos o registro pra evitar órfão.
  const id = crypto.randomBytes(12).toString("base64url");
  const key = pendenteKey(id);

  let uploaded: Awaited<ReturnType<typeof uploadContrato>>;
  try {
    uploaded = await uploadContrato({
      key,
      body: input.buffer,
      contentType: "application/pdf",
      metadata: {
        hash,
        "uploaded-by": input.uploadedById,
      },
    });
  } catch (e) {
    return {
      ok: false,
      erro: `Upload no B2 falhou: ${(e as Error).message}`,
      status: 502,
    };
  }

  const created = await prisma.contratoArquivo.create({
    data: {
      id,
      nomeOriginal: input.nomeOriginal,
      mimeType: input.mimeType,
      tamanhoBytes: BigInt(input.buffer.length),
      b2Bucket: uploaded.bucket,
      b2Key: uploaded.key,
      b2ETag: uploaded.etag,
      hashSha256: hash,
      uploadedById: input.uploadedById,
      status: "pendente_revisao",
      origemImportacao: input.origemImportacao || "manual",
      observacoes: input.observacoes ?? null,
      pessoaId: input.pessoaId ?? null,
      acordoComercialId: input.acordoComercialId ?? null,
    },
    select: { id: true },
  });

  // Fire-and-forget da extração — não bloqueia o response.
  void rodarExtracao(created.id, input.buffer).catch((e) => {
    console.error("[juridico] extração assíncrona falhou:", created.id, e);
  });

  return { ok: true, contratoArquivoId: created.id, jaExistia: false };
}

export async function rodarExtracao(contratoArquivoId: string, pdfBuffer: Buffer): Promise<void> {
  const result = await extrairDadosContrato(pdfBuffer);

  if (!result.ok) {
    await prisma.contratoExtracao.create({
      data: {
        contratoArquivoId,
        modeloIa: process.env.CLAUDE_MODEL_PARSER || "claude-opus-4-7",
        promptVersion: "v1",
        confianca: 0,
        dadosExtraidos: { erro: result.erro, rawResponse: result.rawResponse ?? null },
        erroExtracao: result.erro,
      },
    });
    return;
  }

  await prisma.contratoExtracao.create({
    data: {
      contratoArquivoId,
      modeloIa: result.modelo,
      promptVersion: result.promptVersion,
      confianca: result.confianca,
      dadosExtraidos: result.dadosExtraidos as Prisma.InputJsonValue,
    },
  });
}

/**
 * Aprova um contrato. Move o objeto no B2 da pasta pendentes-revisao/ pra
 * pessoas/<pessoaId>/ (ou aprovados/sem-pessoa/<id>.pdf se ainda não há vínculo).
 * Atualiza status do ContratoArquivo + statusRevisao da última ContratoExtracao.
 */
export async function aprovarContrato(params: {
  contratoArquivoId: string;
  revisadoPorId: string;
  pessoaId?: string;
  dadosCorrigidos?: Record<string, unknown>;
  observacoesRevisao?: string;
}): Promise<{ ok: true; novoKey: string } | { ok: false; erro: string; status: number }> {
  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id: params.contratoArquivoId },
    select: { id: true, b2Key: true, pessoaId: true, status: true },
  });

  if (!contrato) return { ok: false, erro: "Contrato não encontrado", status: 404 };
  if (contrato.status === "aprovado") {
    return { ok: false, erro: "Contrato já aprovado", status: 409 };
  }

  const pessoaIdFinal = params.pessoaId ?? contrato.pessoaId;
  const novoKey = pessoaIdFinal
    ? aprovadoKey(pessoaIdFinal, contrato.id)
    : semVinculoKey(contrato.id);

  if (novoKey !== contrato.b2Key) {
    try {
      await moveContrato({ fromKey: contrato.b2Key, toKey: novoKey });
    } catch (e) {
      return {
        ok: false,
        erro: `Falha ao mover no B2: ${(e as Error).message}`,
        status: 502,
      };
    }
  }

  const ultimaExtracao = await prisma.contratoExtracao.findFirst({
    where: { contratoArquivoId: contrato.id },
    orderBy: { extraidoEm: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.contratoArquivo.update({
      where: { id: contrato.id },
      data: {
        status: "aprovado",
        b2Key: novoKey,
        pessoaId: pessoaIdFinal ?? null,
      },
    });
    if (ultimaExtracao) {
      await tx.contratoExtracao.update({
        where: { id: ultimaExtracao.id },
        data: {
          statusRevisao: params.dadosCorrigidos ? "corrigido" : "aprovado",
          revisadoPorId: params.revisadoPorId,
          revisadoEm: new Date(),
          dadosCorrigidos: (params.dadosCorrigidos as Prisma.InputJsonValue) ?? undefined,
          observacoesRevisao: params.observacoesRevisao ?? null,
        },
      });
    }
  });

  return { ok: true, novoKey };
}

export async function rejeitarContrato(params: {
  contratoArquivoId: string;
  revisadoPorId: string;
  observacoesRevisao: string;
}): Promise<{ ok: true } | { ok: false; erro: string; status: number }> {
  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id: params.contratoArquivoId },
    select: { id: true, status: true },
  });
  if (!contrato) return { ok: false, erro: "Contrato não encontrado", status: 404 };

  const ultimaExtracao = await prisma.contratoExtracao.findFirst({
    where: { contratoArquivoId: contrato.id },
    orderBy: { extraidoEm: "desc" },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.contratoArquivo.update({
      where: { id: contrato.id },
      data: { status: "rejeitado" },
    });
    if (ultimaExtracao) {
      await tx.contratoExtracao.update({
        where: { id: ultimaExtracao.id },
        data: {
          statusRevisao: "rejeitado",
          revisadoPorId: params.revisadoPorId,
          revisadoEm: new Date(),
          observacoesRevisao: params.observacoesRevisao,
        },
      });
    }
  });

  return { ok: true };
}
