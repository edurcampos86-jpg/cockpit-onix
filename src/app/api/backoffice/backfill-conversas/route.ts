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
 * ingest compartilhado (ingestConversa) em CONTEXTO SERVER. Lotes + checkpoint
 * resumível; invocável repetidamente até `terminado`.
 *
 * Portões (espelha /api/painel-atencao):
 *   1. Flag `BACKFILL_CONVERSAS_ENABLED` (default OFF) → 404 (deploy inerte).
 *   2. getSession → 401.   3. getAuthContext + isAdmin → 403 (fail-closed).
 *
 * 🔒 SINGLE-FLIGHT (corrige o clobber de concorrência observado quando o browser
 * re-disparou um GET longo): lock ATÔMICO no Config DB via CAS (um único upsert
 * com RETURNING). Dois requests concorrentes → só um adquire; o outro recebe
 * 409 { ja_rodando } SEM processar. TTL libera lock de run morto (kill não roda
 * o `finally`). Sem migration (lock é uma linha do Config).
 *
 * 🧱 CHECKPOINT DURÁVEL: persiste por PÁGINA (não só no fim) — run interrompido
 * preserva o avanço. Idempotência (upsert por externalId) garante que reprocessar
 * a última página não duplica.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const FLAG = "BACKFILL_CONVERSAS_ENABLED";
const K_CHECKPOINT = "BACKFILL_CONVERSAS_CHECKPOINT";
const K_MANIFEST = "BACKFILL_CONVERSAS_MANIFEST";
const K_LOCK = "BACKFILL_CONVERSAS_LOCK";
// TTL do lock. > maxDuration (300s) de propósito: um run legítimo nunca tem o
// lock expirado no meio (não roda além de 300s), então NUNCA há double-run; só
// um run MORTO (sem `finally`) libera o lock — após o TTL. Tunável via Config.
const LOCK_TTL_MS_DEFAULT = 10 * 60 * 1000;
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

// ── Single-flight: lock atômico via CAS no Config DB ────────────────────────
async function resolverLockTtlMs(): Promise<number> {
  const raw = await getConfig("BACKFILL_CONVERSAS_LOCK_TTL_MIN");
  const n = raw ? Number(raw) : NaN;
  const resolved = Number.isFinite(n) && n > 0 ? n * 60 * 1000 : LOCK_TTL_MS_DEFAULT;
  // PISO > maxDuration: um run legítimo (≤300s) NUNCA pode ter o lock expirado
  // no meio — senão um 2º request adquiriria e reabriria o double-run. Folga 60s.
  // Protege a invariante por código, não por disciplina de quem configura.
  return Math.max(resolved, maxDuration * 1000 + 60_000);
}

/**
 * Acquire ATÔMICO: um único INSERT…ON CONFLICT DO UPDATE…WHERE…RETURNING.
 *  - linha ausente → INSERT (adquire) → RETURNING devolve 1 linha.
 *  - linha livre ('') ou STALE (updatedAt < now-TTL) → UPDATE casa → adquire.
 *  - linha fresca de outro run → WHERE falha → 0 linhas → NÃO adquire (→ 409).
 * Atômico (row-lock do upsert) → sem TOCTOU. A EXPIRAÇÃO usa a coluna
 * `updatedAt` (timestamptz), NÃO o texto do `value`: o value é só o TOKEN
 * (p/ o release casar o próprio lock) e poderia, em tese, ser sobrescrito fora
 * do formato ISO — usar updatedAt remove esse acoplamento frágil.
 */
async function tryAcquireLock(ttlMs: number): Promise<string | null> {
  const agora = new Date();
  const nowIso = agora.toISOString();
  const staleTs = new Date(agora.getTime() - ttlMs);
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    INSERT INTO "Config" ("key", "value", "updatedAt")
    VALUES (${K_LOCK}, ${nowIso}, ${agora})
    ON CONFLICT ("key") DO UPDATE
      SET "value" = ${nowIso}, "updatedAt" = ${agora}
      WHERE "Config"."value" = '' OR "Config"."updatedAt" < ${staleTs}
    RETURNING "value"
  `;
  return rows.length === 1 ? nowIso : null;
}

/** Libera SÓ se o lock ainda é o nosso (value === token) — não rouba o lock de
 *  um run que adquiriu depois do nosso expirar por TTL. */
async function releaseLock(token: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Config" SET "value" = '', "updatedAt" = ${new Date()}
    WHERE "key" = ${K_LOCK} AND "value" = ${token}
  `;
}

// ── Checkpoint + manifest (Config DB; não arquivo — Railway efêmero) ─────────
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

async function appendManifest(novos: string[]): Promise<void> {
  if (novos.length === 0) return;
  const raw = await getConfig(K_MANIFEST);
  const atual = raw ? (JSON.parse(raw) as string[]) : [];
  await setConfig(K_MANIFEST, JSON.stringify(atual.concat(novos)));
}

async function contarManifest(): Promise<number> {
  const raw = await getConfig(K_MANIFEST);
  return raw ? (JSON.parse(raw) as string[]).length : 0;
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

// Uma página de /conversations a partir de `skip` (backoff 429). instanceId é
// ignorado pela API → 1 instância basta. rateLimited após 429 persistente.
//
// ⚠️ LIMITAÇÃO CONHECIDA (deferida — corrigir ANTES do run completo): o `skip`
// é offset cru numa lista ordenada por recência (lastMessageDate). Se uma
// conversa em offset < cursor recebe msg nova durante o sweep (o próprio ingest
// ou o poll concorrente), ela sobe e as de baixo deslizam → uma conversa pode
// ser PULADA (gap de cobertura). Dedup por externalId só evita reprocessar, NÃO
// recupera quem nunca foi buscado. Mitigação: rodar com o poll quieto / fora de
// pico, OU (fix próprio) snapshotar a lista de externalIds no início e iterar
// por ID (não pela ordem viva da API).
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

  // 🔒 single-flight: adquire ANTES de QUALQUER escrita; 409 se outro run fresco
  // segura. reset NÃO destrava o lock aqui fora — blankar K_LOCK fora do CAS
  // reabriria o exato double-run que o lock corrige; o reset roda DENTRO da
  // região protegida (abaixo). Lock de run MORTO é recuperado pelo TTL.
  const ttlMs = await resolverLockTtlMs();
  const lockToken = await tryAcquireLock(ttlMs);
  if (!lockToken) {
    return NextResponse.json(
      { ok: false, ja_rodando: true, mensagem: "outro lote em execução (single-flight); aguarde terminar." },
      { status: 409 },
    );
  }

  try {
    if (reset) {
      // Reset SOB O LOCK: só o dono do lock zera o checkpoint → nunca compete
      // com escritas de checkpoint de um run vivo (que teria recebido 409 acima).
      await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: 0, terminado: false, acumulado: ACUM_ZERO }));
    }
    const cp = await lerCheckpoint();
    if (cp.terminado && !reset) {
      return NextResponse.json({
        terminado: true,
        mensagem: "backfill já concluído (use reset=1 p/ refazer)",
        acumulado: cp.acumulado,
      });
    }

    const instanceId = Object.values(VENDEDORES_CONFIG)[0].instanceIds[0];
    let cursor = cp.cursorSkip;
    const acumulado: Acumulado = { ...cp.acumulado }; // cumulativo (persistido)
    const lote: Acumulado = { ...ACUM_ZERO }; // só desta invocação
    let rateLimited = false;
    let listaAcabou = false;

    // Processa PÁGINA A PÁGINA, commitando checkpoint+manifest a cada página
    // (durável). Para quando este lote atinge batchSize, a lista acaba, ou 429.
    while (lote.processadas < batchSize) {
      const pagina = await fetchPagina(instanceId, token, cursor);
      if (pagina.rateLimited) {
        rateLimited = true;
        break; // para limpo: cursor NÃO avança nesta página → re-tenta depois
      }
      if (pagina.items.length === 0) {
        listaAcabou = true;
        break;
      }
      const individuais = pagina.items.filter(ehIngerivel);
      const manifestPagina: string[] = [];

      for (const conv of individuais) {
        const externalId = String(conv.id ?? conv._id ?? "");
        if (!externalId) continue;
        const tel = derivarTelefone(conv);

        const existente = await prisma.conversa.findUnique({ where: { externalId }, select: { id: true } });
        const wasNew = !existente;

        let msgsRaw: Record<string, unknown>[] = [];
        try {
          msgsRaw = (await fetchMensagens(externalId, token, 1)) as Record<string, unknown>[];
        } catch {
          rateLimited = true;
          break; // erro pontual numa conversa → para; idempotente no retry
        }

        // Backfill: NÃO fabricar sentAt=NOW p/ msg histórica sem timestamp —
        // empurraria lastMessageAt/ultimoContatoAt p/ a data do backfill e
        // "rejuvenesceria" clientes inativos (corromperia o termômetro que esta
        // feature serve). Cap na data real da conversa.
        const fallbackSentAt =
          (conv.lastMessageDate as string | undefined) ??
          (conv.updatedAt as string | undefined) ??
          new Date().toISOString();
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
              sentAt: (m.createdAt as string | undefined) ?? (m.timestamp as string | undefined) ?? fallbackSentAt,
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
        acumulado.processadas++;
        lote.processadas++;
        if (tel) {
          acumulado.comTelefone++;
          lote.comTelefone++;
        } else {
          acumulado.lid++;
          lote.lid++;
        }
        if (res.clienteId) {
          acumulado.casadas++;
          lote.casadas++;
        }
        if (wasNew) {
          acumulado.novas++;
          lote.novas++;
          manifestPagina.push(externalId);
        }
        await sleep(DELAY_CONVERSA_MS);
      }

      // Persiste as linhas criadas nesta página (idempotente; seguro mesmo parcial).
      await appendManifest(manifestPagina);

      if (rateLimited) {
        // 429 no MEIO da página: NÃO avança o cursor → a página inteira é
        // reprocessada no próximo run (ingest idempotente: feitas → no-op).
        // Evita gap de cobertura. (acumulado é progresso aproximado — pode
        // recontar processadas/casadas no retry; a verdade de cobertura é o DB.)
        await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: cursor, terminado: false, acumulado }));
        break;
      }

      // 🧱 Página INTEIRA processada → avança o cursor e commita (durável por página).
      cursor += pagina.items.length; // cursor = offset cru de /conversations
      const fimDaLista = pagina.items.length < TAKE;
      await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: cursor, terminado: fimDaLista, acumulado }));
      if (fimDaLista) {
        listaAcabou = true;
        break;
      }
      await sleep(800);
    }

    const terminado = listaAcabou && !rateLimited;
    // Checkpoint final: garante `terminado` correto mesmo saindo por batchSize.
    await setConfig(K_CHECKPOINT, JSON.stringify({ cursorSkip: cursor, terminado, acumulado }));
    const manifestTotal = await contarManifest();

    const taxaMatch = lote.comTelefone > 0 ? +((100 * lote.casadas) / lote.comTelefone).toFixed(1) : null;
    return NextResponse.json({
      ok: true,
      parou_por_429: rateLimited,
      terminado,
      lote: { ...lote, taxa_match_pct: taxaMatch },
      proximo_cursor: cursor,
      falta_estimada: terminado ? 0 : Math.max(0, 4345 - cursor),
      // AUTORITATIVOS: proximo_cursor (avanço real) + manifest_total (linhas
      // realmente criadas). acumulado é progresso APROXIMADO (pode recontar
      // processadas/casadas no retry de 429). Cobertura real = query no DB
      // (count distinct clienteId), não estes contadores.
      acumulado_aprox: acumulado,
      manifest_total: manifestTotal,
      nota: "cobertura real = DB (distinct clienteId); acumulado_aprox é só progresso",
    });
  } finally {
    // Libera SEMPRE no fim/erro. try/catch p/ que uma falha no release NÃO
    // mascare a resposta já computada como 500 (o trabalho já foi commitado por
    // página; se o release falhar, o TTL é o backstop). Kill duro não roda isto.
    try {
      await releaseLock(lockToken);
    } catch (e) {
      console.error("[backfill-conversas] releaseLock falhou (TTL cobre):", e);
    }
  }
}
