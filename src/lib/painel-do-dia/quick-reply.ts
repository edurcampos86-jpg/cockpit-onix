import "server-only";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/prisma";
import {
  getGoogleClientForUser,
  isInvalidGrantError,
  recordGoogleAuthError,
  touchGoogleAuthUsage,
} from "@/lib/integrations/google-user-oauth";
import { claudeChat } from "./claude-helpers";

/**
 * Quick Reply (Sugestão 6) — gera rascunho de resposta para um e-mail
 * classificado em PainelEmailAI, usando o Claude para escrever o corpo
 * e a Gmail API (gmail.users.drafts.create) para salvar como rascunho.
 *
 * O texto fica em "Rascunhos" do Gmail do usuário — nada é enviado
 * automaticamente. A UI mostra preview + link "Abrir no Gmail".
 *
 * Contexto enriquecido:
 * - Se o e-mail tem `clienteVinculadoId`, puxa nome + PerfilDescoberta
 *   pra ajustar tom (linguagem preferida, sonhos, medos).
 * - Se o e-mail é do Gmail (origem do externoId), busca o corpo completo
 *   via messages.get pra dar contexto além do snippet.
 */

const SCOPE_GMAIL_COMPOSE = "https://www.googleapis.com/auth/gmail.compose";

const MAX_CORPO_CHARS = 2000;
const MAX_PREVIEW_PALAVRAS = 120;

const SYSTEM_PROMPT = `Você é assistente do Eduardo Campos, planejador financeiro
da Onix Investimentos. Ajuda a redigir respostas para e-mails recebidos.

Regras de estilo:
- Português do Brasil, tom profissional e direto, sem floreios.
- Até 120 palavras no corpo.
- Não inclua assinatura, despedida formal longa, nem "Atenciosamente, Eduardo"
  no final — só o corpo. O Gmail já adiciona a assinatura automaticamente.
- Não invente fatos, números, valores ou compromissos que não estejam
  explicitamente no e-mail recebido ou no contexto do cliente.
- Se o e-mail pede uma reunião, sugira janelas amplas ("nesta semana à tarde",
  "começo da próxima semana") em vez de horários específicos — Eduardo
  confirma no calendar.
- Se faltar informação pra responder de verdade, peça o dado faltante de
  forma objetiva.
- Use "você" (não "vc", não "Sr.").

Quando houver "Histórico da conversa" no input:
- Use-o para manter consistência de tom, fatos prometidos e tópico.
- NÃO repita o que você (Eduardo) já disse em respostas anteriores.
- Se você já se comprometeu a algo nesse histórico, honre isso na resposta.
- Se o cliente fez uma pergunta nova que ainda não foi respondida no
  histórico, foque nela.`;

export type EmailContext = {
  aiId: string;
  userId: string;
  externoId: string;
  remetente: string;
  assunto: string;
  snippet: string;
  clienteVinculadoId: string | null;
};

export class ScopeMissingError extends Error {
  constructor(message = "Conta Google não tem permissão gmail.compose.") {
    super(message);
    this.name = "ScopeMissingError";
  }
}

export class EmailNotFoundError extends Error {
  constructor(message = "Email não encontrado para este usuário.") {
    super(message);
    this.name = "EmailNotFoundError";
  }
}

/**
 * Verifica se o registro UserGoogleAuth do usuário tem o escopo gmail.compose.
 * Os escopos são salvos como CSV em userGoogleAuth.scopes.
 */
export async function userHasComposeScope(userId: string): Promise<boolean> {
  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId },
    select: { scopes: true },
  });
  if (!row) return false;
  const tokens = row.scopes
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return tokens.includes(SCOPE_GMAIL_COMPOSE);
}

async function buildClienteContexto(
  clienteVinculadoId: string | null,
): Promise<string | null> {
  if (!clienteVinculadoId) return null;
  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id: clienteVinculadoId },
    select: {
      nome: true,
      classificacao: true,
      nicho: true,
      profissao: true,
      perfilEmocional: true,
      perfilDescoberta: {
        select: {
          linguagemPref: true,
          valoresVida: true,
          sonhos: true,
          medos: true,
        },
      },
    },
  });
  if (!cliente) return null;

  const partes: string[] = [`Nome: ${cliente.nome}`];
  if (cliente.classificacao) partes.push(`Classificação: ${cliente.classificacao}`);
  if (cliente.profissao) partes.push(`Profissão: ${cliente.profissao}`);
  if (cliente.nicho) partes.push(`Nicho: ${cliente.nicho}`);
  if (cliente.perfilDescoberta?.linguagemPref) {
    partes.push(`Linguagem preferida: ${cliente.perfilDescoberta.linguagemPref}`);
  }
  if (cliente.perfilEmocional) {
    partes.push(`Perfil emocional: ${truncar(cliente.perfilEmocional, 300)}`);
  }
  if (cliente.perfilDescoberta?.valoresVida) {
    partes.push(`Valores: ${truncar(cliente.perfilDescoberta.valoresVida, 200)}`);
  }
  if (cliente.perfilDescoberta?.sonhos) {
    partes.push(`Sonhos: ${truncar(cliente.perfilDescoberta.sonhos, 200)}`);
  }
  if (cliente.perfilDescoberta?.medos) {
    partes.push(`Medos: ${truncar(cliente.perfilDescoberta.medos, 200)}`);
  }
  return partes.join("\n");
}

function truncar(s: string, n: number): string {
  const limpo = s.trim();
  if (limpo.length <= n) return limpo;
  return limpo.slice(0, n).trimEnd() + "...";
}

function decodeBase64Url(data: string): string {
  // Gmail retorna texto em base64url. Normaliza pra base64 padrão.
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function encodeBase64Url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf-8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

type GmailHeader = { name?: string | null; value?: string | null };

function findHeader(
  headers: GmailHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const h of headers) {
    if (h.name && h.name.toLowerCase() === target) return h.value ?? null;
  }
  return null;
}

type GmailMessagePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: GmailMessagePart[];
};

/**
 * Extrai texto plano de uma mensagem do Gmail (`format=full`), descendo na
 * árvore de parts. Prefere text/plain; se só tiver text/html, devolve o HTML
 * cru (o Claude lida — não vamos rodar parser de HTML aqui pra evitar
 * dependência extra).
 */
function extrairTextoDaMensagem(payload: GmailMessagePart | null | undefined): string {
  if (!payload) return "";
  // BFS — text/plain ganha sobre text/html
  const plainPartes: string[] = [];
  const htmlPartes: string[] = [];
  const fila: GmailMessagePart[] = [payload];
  while (fila.length > 0) {
    const p = fila.shift()!;
    if (p.parts && p.parts.length > 0) {
      fila.push(...p.parts);
      continue;
    }
    const mime = (p.mimeType ?? "").toLowerCase();
    const data = p.body?.data;
    if (!data) continue;
    try {
      const txt = decodeBase64Url(data);
      if (mime === "text/plain") plainPartes.push(txt);
      else if (mime === "text/html") htmlPartes.push(txt);
    } catch {
      // segmento inválido — ignora
    }
  }
  if (plainPartes.length > 0) return plainPartes.join("\n\n");
  return htmlPartes.join("\n\n");
}

/**
 * Mensagem anterior numa thread — usada como contexto historico pro Claude.
 * Pode vir do Eduardo (outbound) ou de outros participantes (inbound).
 */
export type ThreadMessage = {
  fromHeader: string;
  dateHeader: string | null;
  corpo: string;
  ehDoUsuario: boolean; // true se o From bate com googleEmail/aliases
};

/**
 * Busca as mensagens ANTERIORES de uma thread (exclui a atual). Devolve em
 * ordem cronologica (mais antiga primeiro). Limita a NUM_MSGS_HISTORICO
 * mensagens (mais recentes), cada uma truncada a CHARS_POR_MSG, pra cabacar
 * no contexto do Claude sem estourar o orcamento.
 */
const NUM_MSGS_HISTORICO = 5;
const CHARS_POR_MSG_HISTORICO = 1200;
const CHARS_TOTAL_HISTORICO = 6000;

async function fetchGmailThread(
  auth: OAuth2Client,
  threadId: string,
  excludeMessageId: string,
  meusEmails: Set<string>,
): Promise<ThreadMessage[]> {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const res = await gmail.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });
    const msgs = res.data.messages ?? [];
    const itens: ThreadMessage[] = [];
    for (const m of msgs) {
      if (!m.id || m.id === excludeMessageId) continue;
      const headers = (m.payload?.headers ?? []) as GmailHeader[];
      const fromHeader = findHeader(headers, "From") ?? "(desconhecido)";
      const dateHeader = findHeader(headers, "Date");
      const corpoRaw = extrairTextoDaMensagem(
        m.payload as GmailMessagePart | null | undefined,
      ).trim();
      if (!corpoRaw) continue;
      const fromAddr = extractEmailAddress(fromHeader).toLowerCase();
      itens.push({
        fromHeader,
        dateHeader,
        corpo: truncar(corpoRaw, CHARS_POR_MSG_HISTORICO),
        ehDoUsuario: meusEmails.has(fromAddr),
      });
    }
    // Mantem so as N mais recentes (assume gmail devolve ordem cronologica),
    // depois aplica orcamento total de chars cortando do final pro comeco se
    // exceder.
    const ultimas = itens.slice(-NUM_MSGS_HISTORICO);
    let total = 0;
    const resultado: ThreadMessage[] = [];
    for (let i = ultimas.length - 1; i >= 0; i--) {
      const item = ultimas[i];
      const tamanho = item.corpo.length;
      if (total + tamanho > CHARS_TOTAL_HISTORICO) break;
      total += tamanho;
      resultado.unshift(item);
    }
    return resultado;
  } catch {
    return [];
  }
}

/**
 * Le aliases + googleEmail do UserGoogleAuth pra saber quais e-mails da thread
 * sao "do Eduardo" vs "do outro". Usado pra rotular o historico no prompt.
 */
async function carregarMeusEmails(userId: string): Promise<Set<string>> {
  const row = await prisma.userGoogleAuth.findUnique({
    where: { userId },
    select: { googleEmail: true, aliases: true },
  });
  if (!row) return new Set();
  const lista = [row.googleEmail.toLowerCase()];
  if (row.aliases) {
    for (const a of row.aliases.split(",")) {
      const norm = a.trim().toLowerCase();
      if (norm) lista.push(norm);
    }
  }
  return new Set(lista);
}

/**
 * Busca a mensagem original no Gmail (se o e-mail veio do Gmail) e devolve
 * remetente real, threadId, headers de reply (Message-Id) e corpo.
 * Retorna null se a mensagem não estiver mais lá ou se não for um id Gmail.
 */
async function fetchGmailContext(
  auth: OAuth2Client,
  messageId: string,
): Promise<{
  threadId: string | null;
  fromHeader: string | null;
  subject: string | null;
  messageIdHeader: string | null;
  references: string | null;
  corpo: string;
} | null> {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    const msg = res.data;
    const headers = (msg.payload?.headers ?? []) as GmailHeader[];
    const corpo = extrairTextoDaMensagem(msg.payload as GmailMessagePart | null | undefined);
    return {
      threadId: msg.threadId ?? null,
      fromHeader: findHeader(headers, "From"),
      subject: findHeader(headers, "Subject"),
      messageIdHeader: findHeader(headers, "Message-Id") ?? findHeader(headers, "Message-ID"),
      references: findHeader(headers, "References"),
      corpo,
    };
  } catch {
    return null;
  }
}

/**
 * Extrai apenas o endereço de e-mail dum header `From` no formato
 * "Nome <email@x.com>" — ou devolve a string toda se não houver `<...>`.
 */
function extractEmailAddress(headerValue: string): string {
  const m = headerValue.match(/<([^>]+)>/);
  return (m?.[1] ?? headerValue).trim();
}

/**
 * Monta a mensagem MIME (RFC 2822) já em base64url, pronta pra
 * `gmail.users.drafts.create({requestBody: {message: {raw, threadId}}})`.
 *
 * Headers In-Reply-To/References mantêm a thread no Gmail.
 */
function buildRawMessage(opts: {
  to: string;
  subject: string;
  body: string;
  inReplyTo: string | null;
  references: string | null;
}): string {
  const linhas: string[] = [];
  linhas.push(`To: ${opts.to}`);
  linhas.push(`Subject: ${opts.subject}`);
  linhas.push("MIME-Version: 1.0");
  linhas.push('Content-Type: text/plain; charset="UTF-8"');
  linhas.push("Content-Transfer-Encoding: 7bit");
  if (opts.inReplyTo) linhas.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) linhas.push(`References: ${opts.references}`);
  else if (opts.inReplyTo) linhas.push(`References: ${opts.inReplyTo}`);
  linhas.push("");
  linhas.push(opts.body);
  return encodeBase64Url(linhas.join("\r\n"));
}

function garantirPrefixoRe(subject: string): string {
  const trimmed = subject.trim();
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

function limitarPalavras(texto: string, maxPalavras: number): string {
  const tokens = texto.trim().split(/\s+/);
  if (tokens.length <= maxPalavras) return texto.trim();
  return tokens.slice(0, maxPalavras).join(" ") + "...";
}

/**
 * Formata o historico da thread como bloco de texto pro prompt do Claude.
 * Mensagens do Eduardo prefixadas com "EU (Eduardo)" — o resto com o From real.
 */
function formatarHistoricoThread(mensagens: ThreadMessage[]): string {
  if (mensagens.length === 0) return "";
  const blocos = mensagens.map((m) => {
    const quem = m.ehDoUsuario ? "EU (Eduardo)" : m.fromHeader;
    const data = m.dateHeader ? ` [${m.dateHeader}]` : "";
    return `--- De: ${quem}${data} ---\n${m.corpo}`;
  });
  return `Histórico da conversa (mais antigos primeiro):\n\n${blocos.join("\n\n")}`;
}

/**
 * Gera o corpo da resposta com o Claude, dado um e-mail classificado.
 * Não toca em Gmail aqui — quem chama decide se vira draft ou só preview.
 */
export async function gerarRespostaClaude(opts: {
  remetente: string;
  assunto: string;
  corpoOriginal: string;
  clienteContexto: string | null;
  historicoThread?: ThreadMessage[];
}): Promise<string> {
  const corpoTruncado = truncar(opts.corpoOriginal, MAX_CORPO_CHARS);
  const blocoCliente = opts.clienteContexto
    ? `\n\nContexto do cliente (use pra calibrar tom — NÃO mencione textualmente nada daqui no e-mail):\n${opts.clienteContexto}`
    : "";
  const blocoHistorico = opts.historicoThread && opts.historicoThread.length > 0
    ? `\n\n${formatarHistoricoThread(opts.historicoThread)}`
    : "";

  const user = `${blocoHistorico ? `${blocoHistorico}\n\n` : ""}E-mail recebido (responda a este):
De: ${opts.remetente}
Assunto: ${opts.assunto}

Corpo do e-mail:
${corpoTruncado}${blocoCliente}

Gere apenas o corpo da resposta em português, conforme as regras. Sem cabeçalho, sem assinatura, sem "Re: ...".`;

  const txt = await claudeChat({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 600,
  });
  const limpo = txt.trim();
  return limitarPalavras(limpo, MAX_PREVIEW_PALAVRAS);
}

/**
 * Fluxo completo: busca o PainelEmailAI, monta contexto, chama Claude,
 * cria draft no Gmail. Retorna o id do draft + preview do corpo.
 *
 * Lança ScopeMissingError se faltar gmail.compose nos scopes.
 * Lança EmailNotFoundError se o aiId não pertencer ao userId.
 */
export async function gerarESalvarDraft(
  userId: string,
  aiId: string,
): Promise<{ draftId: string; preview: string; draftUrl: string }> {
  const email = await prisma.painelEmailAI.findFirst({
    where: { id: aiId, userId, arquivado: false },
    select: {
      id: true,
      userId: true,
      externoId: true,
      remetente: true,
      assunto: true,
      snippet: true,
      clienteVinculadoId: true,
    },
  });
  if (!email) throw new EmailNotFoundError();

  if (!(await userHasComposeScope(userId))) {
    throw new ScopeMissingError();
  }

  const auth = await getGoogleClientForUser(userId);
  const clienteContexto = await buildClienteContexto(email.clienteVinculadoId);

  // Tenta enriquecer com a mensagem original no Gmail. Se externoId não for
  // um id do Gmail (ex.: veio do Outlook/ms-mail), o fetch devolve null e a
  // gente cai num fluxo "compose novo" usando só remetente+assunto do AI.
  let gmailCtx: Awaited<ReturnType<typeof fetchGmailContext>> = null;
  try {
    gmailCtx = await fetchGmailContext(auth, email.externoId);
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await recordGoogleAuthError(userId, "invalid_grant — usuário precisa reconectar");
    }
    throw err;
  }

  const remetenteHeader = gmailCtx?.fromHeader ?? email.remetente;
  const enderecoTo = extractEmailAddress(remetenteHeader);
  const assuntoOriginal = gmailCtx?.subject ?? email.assunto;
  const corpoOriginal = gmailCtx?.corpo?.trim()
    ? gmailCtx.corpo
    : email.snippet;

  // Thread context — se a mensagem tem threadId, busca as anteriores pro
  // Claude ter consistencia com o que ja foi dito. Best-effort: erro aqui
  // nao quebra o draft, so resulta em prompt sem historico.
  let historicoThread: ThreadMessage[] = [];
  if (gmailCtx?.threadId) {
    try {
      const meusEmails = await carregarMeusEmails(userId);
      historicoThread = await fetchGmailThread(
        auth,
        gmailCtx.threadId,
        email.externoId,
        meusEmails,
      );
    } catch {
      historicoThread = [];
    }
  }

  const preview = await gerarRespostaClaude({
    remetente: remetenteHeader,
    assunto: assuntoOriginal,
    corpoOriginal,
    clienteContexto,
    historicoThread,
  });

  const raw = buildRawMessage({
    to: enderecoTo,
    subject: garantirPrefixoRe(assuntoOriginal),
    body: preview,
    inReplyTo: gmailCtx?.messageIdHeader ?? null,
    references: gmailCtx?.references ?? gmailCtx?.messageIdHeader ?? null,
  });

  const gmail = google.gmail({ version: "v1", auth });
  let draftId: string;
  try {
    const created = await gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw,
          threadId: gmailCtx?.threadId ?? undefined,
        },
      },
    });
    await touchGoogleAuthUsage(userId);
    const id = created.data.id;
    if (!id) throw new Error("Gmail não devolveu id do draft.");
    draftId = id;
  } catch (err) {
    if (isInvalidGrantError(err)) {
      await recordGoogleAuthError(userId, "invalid_grant — usuário precisa reconectar");
    }
    throw err;
  }

  const draftUrl = `https://mail.google.com/mail/u/0/#drafts/${draftId}`;
  return { draftId, preview, draftUrl };
}
