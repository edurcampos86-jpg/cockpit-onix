import "server-only";
import { prisma } from "@/lib/prisma";
import { toE164, phoneDigits, brazilianPhoneVariants } from "@/lib/phone";
import { broadcastConversaUpdate } from "@/lib/sse-bus";

/**
 * Lógica compartilhada de ingest entre WEBHOOK e POLLING.
 *
 * Tanto o handler de webhook (/api/webhooks/datacrazy) quanto o cron
 * (/api/cron/datacrazy-poll) chamam essas funções — assim a regra de
 * matching cliente↔conversa e a idempotência via externalId ficam num
 * lugar só.
 *
 * Idempotência: tudo é upsert(where: { externalId }). Pode chamar
 * 100 vezes com o mesmo payload — só cria uma vez.
 */

/** Shape mínimo de uma "conversa" do DataCrazy que conseguimos ingerir. */
export interface ConversaCanonical {
  externalId: string;        // conversa.id no DataCrazy
  instanceId: string;
  contactPhone?: string | null;
  contactName?: string | null;
  lastMessageAt?: string | Date | null;
}

/** Shape mínimo de uma "mensagem". */
export interface MensagemCanonical {
  externalId: string;        // message.id no DataCrazy
  conversaExternalId: string;
  fromMe: boolean;
  tipo: string;              // "text" | "audio" | "image" | ...
  body?: string | null;
  mediaUrl?: string | null;
  sentAt: string | Date;
  rawPayload?: unknown;
}

/**
 * Tenta resolver clienteId pelo telefone normalizado.
 * Estratégia em 3 passos, do mais firme pro mais tolerante:
 *   1. Match exato em E.164 (usa @@index([telefone]))
 *   2. Match exato com variante BR com/sem "9" inicial — WhatsApp/IDs antigos
 *      vêm sem o 9 obrigatório de pós-2014; cadastros novos vêm com.
 *   3. Fallback: últimos 11 dígitos (cobre caso BTG sem DDI)
 */
async function resolverClienteIdPorTelefone(rawPhone: string | null | undefined): Promise<string | null> {
  const e164 = toE164(rawPhone);
  if (e164) {
    // (1) Match exato
    const exato = await prisma.clienteBackoffice.findFirst({
      where: { telefone: e164 },
      select: { id: true },
    });
    if (exato) return exato.id;

    // (2) Variantes BR com/sem o "9" inicial
    const variantes = brazilianPhoneVariants(e164).filter((v) => v !== e164);
    if (variantes.length > 0) {
      const comVariante = await prisma.clienteBackoffice.findFirst({
        where: { telefone: { in: variantes } },
        select: { id: true },
      });
      if (comVariante) return comVariante.id;
    }
  }

  // (3) Fallback: matching por dígitos finais (8 dígitos do número local,
  // ignorando DDI e DDD pra cobrir cadastros com formato muito divergente)
  const digits = phoneDigits(rawPhone);
  if (digits.length >= 10) {
    const ultimos8 = digits.slice(-8);
    const candidato = await prisma.clienteBackoffice.findFirst({
      where: { telefone: { endsWith: ultimos8 } },
      select: { id: true },
    });
    if (candidato) return candidato.id;
  }

  return null;
}

/**
 * Ingerge uma conversa + suas mensagens.
 * Faz upsert idempotente e dispara broadcastConversaUpdate
 * se o cliente estiver linkado.
 *
 * Retorna se algo foi de fato modificado (true) ou se já estava em
 * dia (false) — útil pro polling decidir se vale broadcastar.
 */
export async function ingestConversa(
  c: ConversaCanonical,
  mensagens: MensagemCanonical[],
): Promise<{ conversaId: string; clienteId: string | null; novasMensagens: number }> {
  const clienteId = await resolverClienteIdPorTelefone(c.contactPhone);
  const lastMessageAt = c.lastMessageAt ? new Date(c.lastMessageAt) : null;

  const conversa = await prisma.conversa.upsert({
    where: { externalId: c.externalId },
    create: {
      externalId: c.externalId,
      instanceId: c.instanceId,
      contactPhone: toE164(c.contactPhone),
      contactName: c.contactName ?? null,
      clienteId,
      unmatched: !clienteId,
      lastMessageAt,
    },
    update: {
      contactPhone: toE164(c.contactPhone) ?? undefined,
      contactName: c.contactName ?? undefined,
      // Só atualiza clienteId se não estava resolvido antes e agora resolvemos
      clienteId: clienteId ?? undefined,
      unmatched: clienteId ? false : undefined,
      lastMessageAt: lastMessageAt ?? undefined,
    },
  });

  let novasMensagens = 0;
  for (const m of mensagens) {
    // Tolera race condition do Prisma upsert: quando webhook e polling
    // ingerem a mesma mensagem em paralelo, o SELECT do upsert vê "não
    // existe", mas o INSERT seguinte colide com outro INSERT concorrente.
    // P2002 (Unique constraint) nesse caso significa "alguém já ingeriu" —
    // tratar como noop em vez de propagar o erro. Sem isso, o sync inteiro
    // do vendedor parava na primeira mensagem duplicada.
    try {
      const r = await prisma.mensagem.upsert({
        where: { externalId: m.externalId },
        create: {
          externalId: m.externalId,
          conversaId: conversa.id,
          fromMe: m.fromMe,
          tipo: m.tipo,
          body: m.body ?? null,
          mediaUrl: m.mediaUrl ?? null,
          sentAt: new Date(m.sentAt),
          rawPayload: (m.rawPayload as object | undefined) ?? undefined,
        },
        update: {}, // idempotente — nunca sobrescreve
      });
      if (r.recebidoEm.getTime() > Date.now() - 5000) novasMensagens++;
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (code === "P2002") {
        // Mensagem já existe (race com webhook). Segue.
        continue;
      }
      throw e;
    }
  }

  // Atualiza lastMessageAt se houver mensagem mais recente que o que veio no payload
  if (mensagens.length > 0) {
    const maisRecente = mensagens.reduce((max, m) => {
      const d = new Date(m.sentAt);
      return d > max ? d : max;
    }, lastMessageAt ?? new Date(0));
    if (!lastMessageAt || maisRecente > lastMessageAt) {
      await prisma.conversa.update({
        where: { id: conversa.id },
        data: { lastMessageAt: maisRecente },
      });
    }
  }

  // Atualiza ultimoContatoAt do cliente quando há match. Usamos updateMany
  // com filtro `lt` pra evitar regredir o campo se o payload trouxer uma
  // mensagem antiga (caso raro do polling pegar histórico).
  if (clienteId) {
    const candidato = mensagens.reduce(
      (max, m) => {
        const d = new Date(m.sentAt);
        return d > max ? d : max;
      },
      lastMessageAt ?? new Date(0),
    );
    if (candidato.getTime() > 0) {
      await prisma.clienteBackoffice.updateMany({
        where: {
          id: clienteId,
          OR: [{ ultimoContatoAt: null }, { ultimoContatoAt: { lt: candidato } }],
        },
        data: { ultimoContatoAt: candidato },
      });
    }
  }

  // Broadcast SSE apenas se conversa está linkada a cliente E houve novidade
  if (clienteId && novasMensagens > 0 && lastMessageAt) {
    broadcastConversaUpdate(clienteId, {
      conversaId: conversa.id,
      lastMessageAt,
    });
  }

  return { conversaId: conversa.id, clienteId, novasMensagens };
}

/** Mapeia o tipo de mensagem do DataCrazy pra nossa enum. */
export function normalizarTipoMensagem(raw: string | undefined | null): string {
  const t = (raw ?? "").toLowerCase();
  if (["text", "chat", "extendedtextmessage"].includes(t)) return "text";
  if (["audio", "voice", "ptt"].includes(t)) return "audio";
  if (["image", "img"].includes(t)) return "image";
  if (["video", "videomessage"].includes(t)) return "video";
  if (["document", "doc", "file"].includes(t)) return "document";
  if (t === "sticker") return "sticker";
  return "text"; // default seguro
}

/** Extrai body considerando múltiplos formatos do payload DataCrazy. */
export function extrairBody(m: Record<string, unknown>): string | null {
  const candidates = [
    m.body,
    m.text,
    (m.message as Record<string, unknown> | undefined)?.conversation,
    ((m.message as Record<string, unknown> | undefined)?.extendedTextMessage as Record<string, unknown> | undefined)?.text,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}
