/**
 * Backfill de conversas DataCrazy → Conversa/Mensagem (cobertura).
 *
 * Rodar o DRY-RUN (padrão, READ-ONLY, não escreve no DB):
 *   DATABASE_URL=<prod-public> DATACRAZY_TOKEN=<token> npx tsx scripts/backfill-conversas.ts
 *   (pegar URL pública: railway variables -s Postgres --kv | grep DATABASE_PUBLIC_URL
 *    pegar token:        railway variables -s cockpit-onix --kv | grep DATACRAZY_TOKEN)
 *
 * Fechado pelos recons (ver memória cockpit-conversas-backfill-sizing):
 *  - /conversations PAGINA por skip (~44 págs, ~4.345); `instanceId` é IGNORADO
 *    pela API → UM passe, sem loop de instância.
 *  - /messages NÃO pagina (só as ~20 mais novas/conversa). Cobertura aceita isso:
 *    casa por telefone (metadados da conversa) + datas recentes de direção.
 *  - Base 99,9% telefonada; ~9% das conversas são @lid (sem telefone) → unmatched.
 *
 * server-only: o ingest/matcher compartilhados (`datacrazy-ingest`, `cliente-matching`)
 * importam "server-only" e NÃO podem ser importados por tsx. Por isso:
 *  - DRY-RUN casa IN-MEMORY reusando as primitivas de `@/lib/phone` — espelha
 *    passo-a-passo `resolverClienteIdPorTelefone` (E.164 → variantes BR → últimos 8).
 *  - --execute importa `ingestConversa` DINAMICAMENTE (só roda em contexto server;
 *    ver NOTA no executeBackfill). NÃO é invocado nesta etapa.
 */
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../src/lib/prisma";
import { fetchConversas, VENDEDORES_CONFIG } from "../src/lib/datacrazy";
import { toE164, phoneDigits, brazilianPhoneVariants } from "../src/lib/phone";
import { getConfig } from "../src/lib/config-db";

const EXECUTE = process.argv.includes("--execute");
const CHECKPOINT = path.join(__dirname, ".backfill-conversas-checkpoint.json");
const MANIFEST = path.join(__dirname, ".backfill-conversas-manifest.jsonl");

// ── Telefone da conversa (espelha poll-runner/webhook): contactId com "@" = @lid,
//    descartado como telefone. ────────────────────────────────────────────────
function derivarTelefone(conv: Record<string, unknown>): string | null {
  const c = conv.contact as Record<string, unknown> | undefined;
  const rawContactId = c?.contactId as string | undefined;
  const contactIdValido = rawContactId && !rawContactId.includes("@") ? rawContactId : undefined;
  return (
    (c?.phone as string | undefined) ??
    (c?.number as string | undefined) ??
    contactIdValido ??
    (conv.phone as string | undefined) ??
    null
  );
}

// ── Índice em memória dos clientes (1 query) p/ casar sem martelar o DB. ───────
//    Espelha resolverClienteIdPorTelefone: exato E.164 → variantes BR → últimos 8.
interface PhoneIndex {
  exato: Map<string, string>; // telefone (como armazenado) → clienteId
  ultimos8: Map<string, string>; // últimos 8 dígitos → clienteId
}
function matchClienteId(rawPhone: string | null, idx: PhoneIndex): string | null {
  const e164 = toE164(rawPhone);
  if (e164) {
    const exato = idx.exato.get(e164);
    if (exato) return exato;
    for (const v of brazilianPhoneVariants(e164)) {
      if (v === e164) continue;
      const hit = idx.exato.get(v);
      if (hit) return hit;
    }
  }
  const digits = phoneDigits(rawPhone);
  if (digits.length >= 10) {
    const hit = idx.ultimos8.get(digits.slice(-8));
    if (hit) return hit;
  }
  return null;
}

async function carregarIndice(): Promise<{ idx: PhoneIndex; clientesTotal: number }> {
  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, telefone: true },
  });
  const idx: PhoneIndex = { exato: new Map(), ultimos8: new Map() };
  for (const c of clientes) {
    if (!c.telefone) continue;
    if (!idx.exato.has(c.telefone)) idx.exato.set(c.telefone, c.id);
    const d = phoneDigits(c.telefone);
    if (d.length >= 8) {
      const k = d.slice(-8);
      if (!idx.ultimos8.has(k)) idx.ultimos8.set(k, c.id);
    }
  }
  return { idx, clientesTotal: clientes.length };
}

// ── Paginação /conversations: UM passe (instanceId ignorado → 1ª instância). ───
async function buscarTodasConversas(token: string): Promise<Array<Record<string, unknown>>> {
  const instanceId = Object.values(VENDEDORES_CONFIG)[0].instanceIds[0];
  // maxPages alto: 1 passe completo (~44 págs). fetchConversas já filtra grupos,
  // internos e hidden, e tem delay(1000)+backoff 429 (throttle).
  return fetchConversas(instanceId, token, 100);
}

async function dryRun(token: string): Promise<void> {
  console.log("=== BACKFILL CONVERSAS — DRY-RUN (read-only, NÃO escreve no DB) ===\n");

  const { idx, clientesTotal } = await carregarIndice();
  const existentes = new Set(
    (await prisma.conversa.findMany({ select: { externalId: true } })).map((c) => c.externalId),
  );

  const t0 = Date.now();
  const convs = await buscarTodasConversas(token);

  let lid = 0;
  let comTelefone = 0;
  let casadas = 0;
  let jaExistem = 0;
  const clientesCasados = new Set<string>();

  for (const conv of convs) {
    const externalId = String(conv.id ?? conv._id ?? "");
    if (existentes.has(externalId)) jaExistem++;

    const tel = derivarTelefone(conv);
    if (!tel) {
      lid++;
      continue;
    }
    comTelefone++;
    const clienteId = matchClienteId(tel, idx);
    if (clienteId) {
      casadas++;
      clientesCasados.add(clienteId);
    }
  }

  const novas = convs.length - jaExistem;
  const distintos = clientesCasados.size;
  const coberturaProjetada = ((100 * distintos) / Math.max(1, clientesTotal)).toFixed(1);
  const noDbHoje = existentes.size;

  console.log("── Origem (1 passe /conversations, grupos/internos/hidden já filtrados) ──");
  console.log(`conversas individuais na origem: ${convs.length}`);
  console.log(`  @lid (sem telefone, unmatched): ${lid}  (${((100 * lid) / Math.max(1, convs.length)).toFixed(1)}%)`);
  console.log(`  com telefone:                   ${comTelefone}`);
  console.log("\n── Match projetado (in-memory, espelha o matcher) ──");
  console.log(`conversas que casariam a um cliente: ${casadas}`);
  console.log(`CLIENTES DISTINTOS casados:          ${distintos}`);
  console.log(`COBERTURA PROJETADA = ${distintos}/${clientesTotal} = ${coberturaProjetada}%   ← número-chave`);
  console.log("\n── Delta vs DB ──");
  console.log(`conversas já no DB:        ${noDbHoje}`);
  console.log(`das buscadas, já existem:  ${jaExistem}`);
  console.log(`NOVAS que o backfill adicionaria: ${novas}`);
  console.log(`\ntempo: ${Math.round((Date.now() - t0) / 1000)}s · NENHUMA escrita no DB · NENHUMA msg buscada`);
}

/**
 * NOTA (não roda nesta etapa): o caminho de escrita reusa `ingestConversa`, que é
 * "server-only" e NÃO importa por tsx — deve rodar em contexto server (rota admin
 * no app Next). Aqui fica o desenho; o import é dinâmico p/ não quebrar o dry-run.
 *
 * Garantias do desenho:
 *  - IDEMPOTÊNCIA: ingestConversa faz upsert por externalId (Conversa e Mensagem)
 *    → re-rodar é seguro, nunca duplica.
 *  - CHECKPOINT resumível: persiste { lastSkip, processados[] } em CHECKPOINT;
 *    no start, retoma de onde parou (sobrevive a 429/queda).
 *  - MARCA de backfill (reversibilidade): sem migration agora, registra cada
 *    externalId criado em MANIFEST (jsonl) → reverter = apagar esses externalIds.
 *    Marca DB-level apropriada = coluna nullable `origemBackfill` (migration futura).
 *  - THROTTLE: fetchConversas/fetchMensagens já têm delay + backoff 429; +delay
 *    entre conversas. /messages só traz ~20 (sem paginação) — 1 fetch/conversa.
 */
async function executeBackfill(token: string): Promise<void> {
  void token;
  void CHECKPOINT;
  void MANIFEST;
  void fs;
  // Import DINÂMICO (server-only) — só executa em contexto server; sob tsx lança.
  // const { ingestConversa, normalizarTipoMensagem, extrairBody } =
  //   await import("../src/lib/integrations/datacrazy-ingest");
  // const { fetchMensagens } = await import("../src/lib/datacrazy");
  // ... retomar de CHECKPOINT → fetchConversas (1 passe) → por conversa:
  //     msgs = fetchMensagens(externalId, token, 1)  // newest ~20 (sem paginação)
  //     ingestConversa(canonica, msgs)               // upsert idempotente
  //     append externalId em MANIFEST; atualizar CHECKPOINT; delay entre conversas.
  throw new Error(
    "--execute desenhado mas não habilitado nesta etapa: o ingest é server-only " +
      "(roda via rota admin no app, não via tsx). Ver NOTA no topo de executeBackfill().",
  );
}

async function main(): Promise<void> {
  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    console.error("ABORT: DATACRAZY_TOKEN ausente (Config DB ou env).");
    process.exit(1);
  }
  if (EXECUTE) {
    await executeBackfill(token);
  } else {
    await dryRun(token);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("ERRO:", e instanceof Error ? e.message : e);
  process.exit(1);
});
