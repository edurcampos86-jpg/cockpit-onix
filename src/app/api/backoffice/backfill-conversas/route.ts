import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { getConfig, setConfig } from "@/lib/config-db";
import { VENDEDORES_CONFIG, CONTATOS_INTERNOS, fetchMensagens } from "@/lib/datacrazy";
import {
  ingestConversa,
  normalizarTipoMensagem,
  extrairBody,
  type ConversaCanonical,
  type MensagemCanonical,
} from "@/lib/integrations/datacrazy-ingest";

/**
 * GET /api/backoffice/backfill-conversas?batchSize=150[&reset=1]
 *
 * Backfill de conversas DataCrazy → Conversa/Mensagem (cobertura). Reusa o
 * ingest compartilhado (ingestConversa) em CONTEXTO SERVER — o que o script tsx
 * não podia (server-only). Projeção do dry-run (PR #180): ~73,5% de cobertura.
 *
 * Por que LOTES + CHECKPOINT: o passe completo é rate-limited (429) e leva
 * horas; o Railway não roda horas num request. Cada chamada processa um lote
 * curto a partir do checkpoint e RETORNA — invocável repetidamente até terminar.
 *
 * Portões (espelha /api/painel-atencao):
 *   1. Flag Config DB `BACKFILL_CONVERSAS_ENABLED` (default OFF) → 404. Deploy
 *      fica INERTE: mesmo no ar, a rota não escreve nada até ligar a flag.
 *   2. getSession → 401 (precede getAuthContext p/ não virar redirect 307).
 *   3. getAuthContext + isAdmin → 403 (fail-closed admin-only).
 *
 * Estado (Config DB, não arquivo — Railway é efêmero/multi-instância):
 *   - BACKFILL_CONVERSAS_CHECKPOINT: { cursorSkip, terminado, acumulado{...} }
 *     → resumível: cada chamada retoma de onde parou.
 *   - BACKFILL_CONVERSAS_MANIFEST: string[] dos externalId CRIADOS pelo backfill
 *     → reversibilidade dirigida (rollback = deleteMany onde externalId IN manifest;
 *       cascata apaga Mensagem). Só entram conversas NOVAS (wasNew), não as que o
 *       poll já tinha. Marca DB-level (coluna `origemBackfill`) fica p/ futuro.
 *
 * Idempotência: ingestConversa faz upsert por externalId → re-rodar um lote
 * (ou após timeout/429 mid-batch) nunca duplica.
 *
 * NÃO há paginação de /messages (só ~20 mais novas) — 1 fetch/conversa, aceito
 * pra cobertura (casa por telefone + datas recentes de direção).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const FLAG = "BACKFILL_CONVERSAS_ENABLED";
const K_CHECKPOINT = "BACKFILL_CONVERSAS_CHECKPOINT";
const K_MANIFEST = "BACKFILL_CONVERSAS_MANIFEST";
// Espelha DATACRAZY_BASE_URL (não exportado em datacrazy.ts).
const DC_BASE = "https://api.g1.datacrazy.io/api/v1";
const TAKE = 100; // página da API de /conversations
const DELAY_CONVERSA_MS = 250; // throttle gentil entre conversas

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const parseBool = (v: string | undefined): boolean =>
  !!v && ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());

interface Acumulado {
  processadas: number;
  novas: number;
  casadas: number;
  comTelefone: number;
  lid: number;
}
interface Checkpoint {
  cursorSkip: number;
  terminado: boolean;
  acumulado: Acumulado;
}
const ACUM_ZERO: Acumulado = { processadas: 0, novas: 0, casadas: 0, comTelefone: 0, lid: 0 };

async function lerCheckpoint(): Promise<Checkpoint> {
  const raw = await getConfig(K_CHECKPOINT);
  if (!raw) return { cursorSkip: 0, terminado: false, acumulado: { ...ACUM_ZERO } };
  try {
    const c = JSON.parse(raw) as Partial<Checkpoint>;
    return {
      cursorSkip: c.cursorSkip ?? 0,
      terminado: c.terminado ?? false,
      acumulado: { ...ACUM_ZERO, ...(c.acumulado ?? {}) },
    };
  } catch {
    return { cursorSkip: 0, terminado: false, acumulado: { ...ACUM_ZERO } };
  }
}

async function appendManifest(novos: string[]): Promise<number> {
  if (novos.length === 0) {
    const raw = await getConfig(K_MANIFEST);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
  }
  const raw = await getConfig(K_MANIFEST);
  const atual = raw ? (JSON.parse(raw) as string[]) : [];
  const merged = atual.concat(novos);
  await setConfig(K_MANIFEST, JSON.stringify(merged));
  return merged.length;
}

// Telefone da conversa — espelha poll-runner/webhook: contactId com "@" = @lid.
function derivarTelefone(conv: Record<string, unknown>): string | null {
  const c = conv.contact as Record<string, unknown> | undefined;
  const rawId = c?.contactId as string | undefined;
  const idValido = rawId && !rawId.includes("@") ? rawId : undefined;
  return (
    (c?.phone as string | undefined) ??
    (c?.number as string | undefined) ??
    idValido ??
    (conv.phone as string | undefined) ??
    null
  );
}

// Uma página de /conversations a partir de `skip` (com backoff 429). instanceId
// é ignorado pela API → 1 instância basta. rateLimited=true após 429 persistente.
async function fetchPagina(
  instanceId: string,
  token: string,
  skip: number,
): Promise<{ items: Record<string, unknown>[]; rateLimited: boolean }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${DC_BASE}/conversations?instanceId=${instanceId}&take=${TAKE}&skip=${skip}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`fetchPagina HTTP ${res.status}`);
    const data = await res.json();
    const items = (Array.isArray(data) ? data : data.data ?? data.items ?? []) as Record<string, unknown>[];
    return { items, rateLimited: false };
  }
  return { items: [], rateLimited: true };
}

function ehIngerivel(conv: Record<string, unknown>): boolean {
  if (conv.isGroup === true) return false;
  const c = conv.contact as Record<string, unknown> | undefined;
  const phone = (c?.phone as string) ?? (c?.number as string) ?? (conv.phone as string) ?? "";
  if (CONTATOS_INTERNOS.has(phone)) return false;
  if ((conv.status as string) === "hidden") return false;
  return true;
}

export async function GET(req: NextRequest) {
  // 1. Flag OFF → finge não existir (deploy inerte).
  if (!parseBool(await getConfig(FLAG))) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // 2. Sessão (precede getAuthContext p/ evitar redirect 307 em rota de API).
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  }
  // 3. Fail-closed admin-only.
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) {
    return NextResponse.json({ error: "acesso negado" }, { status: 403 });
  }

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json({ error: "DATACRAZY_TOKEN não configurado" }, { status: 400 });
  }

  const batchSize = Math.min(Math.max(Number(req.nextUrl.searchParams.get("batchSize") ?? 150), 1), 300);
  const reset = parseBool(req.nextUrl.searchParams.get("reset") ?? undefined);

  if (reset) {
    await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: 0, terminado: false, acumulado: ACUM_ZERO }));
  }

  const cp = await lerCheckpoint();
  if (cp.terminado && !reset) {
    return NextResponse.json({ terminado: true, mensagem: "backfill já concluído (use reset=1 p/ refazer)", acumulado: cp.acumulado });
  }

  const instanceId = Object.values(VENDEDORES_CONFIG)[0].instanceIds[0];

  // Coleta uma janela de até `batchSize` conversas ingeríveis a partir do cursor.
  let cursor = cp.cursorSkip;
  const janela: Record<string, unknown>[] = [];
  let rateLimited = false;
  let listaAcabou = false;
  while (janela.length < batchSize) {
    const { items, rateLimited: rl } = await fetchPagina(instanceId, token, cursor);
    if (rl) { rateLimited = true; break; } // para limpo no cursor atual (re-tenta depois)
    if (items.length === 0) { listaAcabou = true; break; }
    cursor += items.length; // avança pelo bruto (cursor = offset cru de /conversations)
    for (const c of items) if (ehIngerivel(c)) janela.push(c);
    if (items.length < TAKE) { listaAcabou = true; break; }
    await sleep(800);
  }

  // Processa a janela: ingere cada conversa (newest ~20 msgs) via ingestConversa.
  const lote: Acumulado = { ...ACUM_ZERO };
  const manifestNovos: string[] = [];
  for (const conv of janela) {
    const externalId = String(conv.id ?? conv._id ?? "");
    if (!externalId) continue;
    const tel = derivarTelefone(conv);

    const existente = await prisma.conversa.findUnique({ where: { externalId }, select: { id: true } });
    const wasNew = !existente;

    let msgsRaw: Record<string, unknown>[] = [];
    try {
      msgsRaw = (await fetchMensagens(externalId, token, 1)) as Record<string, unknown>[];
    } catch {
      // 429/erro pontual numa conversa → para limpo; cursor NÃO inclui esta janela
      // por completo, mas re-rodar é idempotente (upsert). Salva o que já processou.
      rateLimited = true;
      break;
    }

    const mensagens: MensagemCanonical[] = msgsRaw
      .map((m): MensagemCanonical | null => {
        const msgId = (m.id as string | undefined) ?? (m._id as string | undefined);
        if (!msgId) return null;
        return {
          externalId: msgId,
          conversaExternalId: externalId,
          fromMe: m.fromMe === true || m.received === false,
          tipo: normalizarTipoMensagem((m.type as string | undefined) ?? (m.messageType as string | undefined)),
          body: extrairBody(m),
          mediaUrl: (m.mediaUrl as string | undefined) ?? (m.media_url as string | undefined) ?? null,
          sentAt: (m.createdAt as string | undefined) ?? (m.timestamp as string | undefined) ?? new Date().toISOString(),
          rawPayload: m,
        };
      })
      .filter((x): x is MensagemCanonical => x !== null);

    const contact = conv.contact as Record<string, unknown> | undefined;
    const conversa: ConversaCanonical = {
      externalId,
      instanceId,
      contactPhone: tel,
      contactName:
        (contact?.name as string | undefined) ??
        (conv.contactName as string | undefined) ??
        (conv.name as string | undefined) ??
        null,
      lastMessageAt:
        (conv.lastMessageDate as string | undefined) ??
        (conv.updatedAt as string | undefined) ??
        ((conv.lastMessage as Record<string, unknown> | undefined)?.createdAt as string | undefined) ??
        null,
    };

    const res = await ingestConversa(conversa, mensagens);
    lote.processadas++;
    if (tel) lote.comTelefone++;
    else lote.lid++;
    if (res.clienteId) lote.casadas++;
    if (wasNew) {
      lote.novas++;
      manifestNovos.push(externalId);
    }
    await sleep(DELAY_CONVERSA_MS);
  }

  // Persiste checkpoint + manifest. terminado só quando a lista acabou de fato.
  const terminado = listaAcabou && !rateLimited;
  const acumulado: Acumulado = {
    processadas: cp.acumulado.processadas + lote.processadas,
    novas: cp.acumulado.novas + lote.novas,
    casadas: cp.acumulado.casadas + lote.casadas,
    comTelefone: cp.acumulado.comTelefone + lote.comTelefone,
    lid: cp.acumulado.lid + lote.lid,
  };
  await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: cursor, terminado, acumulado }));
  const manifestTotal = await appendManifest(manifestNovos);

  // PARIDADE: taxa de match REAL do lote (via ingestConversa) p/ comparar com a
  // projeção do dry-run (~73,5%). taxa sobre conversas COM telefone (exclui @lid).
  const taxaMatch = lote.comTelefone > 0 ? +(100 * lote.casadas / lote.comTelefone).toFixed(1) : null;

  return NextResponse.json({
    ok: true,
    parou_por_429: rateLimited,
    terminado,
    lote: { ...lote, taxa_match_pct: taxaMatch },
    proximo_cursor: cursor,
    falta_estimada: terminado ? 0 : Math.max(0, 4345 - cursor), // ~4.345 brutas no sizing
    acumulado,
    manifest_total: manifestTotal,
  });
}
