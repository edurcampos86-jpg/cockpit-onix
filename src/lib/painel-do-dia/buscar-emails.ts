import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getConfig } from "@/lib/config-db";
import { getIntegrationConfig } from "@/lib/integrations/config";

/**
 * Busca full-text em PainelEmailAI + rerank por Claude.
 *
 * Etapa 1 — Postgres: tsvector gerado (assunto+snippet+remetente) +
 *   plainto_tsquery('portuguese'). Top 20 ordenado por ts_rank.
 * Etapa 2 — Claude (haiku, barato): dada a query original e os 20 candidatos
 *   (id+assunto+snippet+data), devolve top 5 com motivo curto.
 *
 * Sem embeddings, sem pgvector. Quando o Claude falha (timeout/quota), faz
 * fallback: devolve os 20 da etapa 1 com motivo "ranking básico".
 *
 * NOTA: o modelo PainelEmailAI nao tem coluna `recebidoEm` nem `link`. Usamos
 * `classificadoEm` como proxy temporal e construimos o link do Gmail a partir
 * do `externoId` (id do messageThread no Gmail) no caller.
 */

const RERANK_MODEL = "claude-haiku-4-5-20251001";
const RERANK_TIMEOUT_MS = 15_000;
const TOP_N_POSTGRES = 20;
const TOP_N_RERANK = 5;

export type FiltrosBusca = {
  clienteId?: string;
  dataDe?: string; // ISO YYYY-MM-DD
  dataAte?: string; // ISO YYYY-MM-DD
};

export type ResultadoBusca = {
  id: string;
  assunto: string;
  remetente: string;
  snippet: string;
  recebidoEm: string; // ISO — derivado de classificadoEm/createdAt
  link: string; // construido a partir do externoId
  clienteVinculadoId?: string;
  motivo: string;
};

type RowFTS = {
  id: string;
  externoId: string;
  assunto: string;
  snippet: string;
  remetente: string;
  classificadoEm: Date;
  clienteVinculadoId: string | null;
  rank: number;
};

type RerankItem = { id: string; motivo: string };

function gmailLink(externoId: string): string {
  // Gmail abre #all/<threadId>; se o externoId nao for um threadId valido,
  // o Gmail simplesmente cai na inbox.
  return `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(externoId)}`;
}

function buildWhere(
  userId: string,
  query: string,
  filtros: FiltrosBusca | undefined,
): Prisma.Sql {
  const partes: Prisma.Sql[] = [
    Prisma.sql`"userId" = ${userId}`,
    Prisma.sql`"tsv" @@ plainto_tsquery('portuguese', ${query})`,
    Prisma.sql`"arquivado" = false`,
  ];
  if (filtros?.clienteId) {
    partes.push(Prisma.sql`"clienteVinculadoId" = ${filtros.clienteId}`);
  }
  if (filtros?.dataDe) {
    partes.push(Prisma.sql`"classificadoEm" >= ${new Date(filtros.dataDe)}`);
  }
  if (filtros?.dataAte) {
    // dataAte inclusivo: somamos 1 dia
    const ate = new Date(filtros.dataAte);
    ate.setDate(ate.getDate() + 1);
    partes.push(Prisma.sql`"classificadoEm" < ${ate}`);
  }
  return Prisma.join(partes, " AND ");
}

async function buscarPostgres(
  userId: string,
  query: string,
  filtros: FiltrosBusca | undefined,
): Promise<RowFTS[]> {
  const where = buildWhere(userId, query, filtros);
  // ts_rank usa o mesmo tsquery — passamos a query duas vezes (custo desprezivel).
  const sql = Prisma.sql`
    SELECT
      "id",
      "externoId",
      "assunto",
      "snippet",
      "remetente",
      "classificadoEm",
      "clienteVinculadoId",
      ts_rank("tsv", plainto_tsquery('portuguese', ${query})) AS "rank"
    FROM "PainelEmailAI"
    WHERE ${where}
    ORDER BY "rank" DESC
    LIMIT ${TOP_N_POSTGRES}
  `;
  return prisma.$queryRaw<RowFTS[]>(sql);
}

async function rerankComClaude(
  query: string,
  candidatos: RowFTS[],
): Promise<RerankItem[] | null> {
  if (candidatos.length === 0) return [];

  const lista = candidatos
    .map((c, i) => {
      const data = c.classificadoEm.toISOString().slice(0, 10);
      return `${i + 1}. id=${c.id} [${data}] de "${c.remetente}" — ${c.assunto}\n   ${c.snippet}`;
    })
    .join("\n");

  const system = `Voce e um assistente que ranqueia e-mails por relevancia para uma busca.
O usuario fez uma busca em portugues. Voce recebe ate 20 candidatos pre-filtrados
por full-text. Escolha ate ${TOP_N_RERANK} mais relevantes para a busca, em ordem
decrescente de relevancia.
Para cada um, escreva um motivo curtissimo (max 10 palavras) explicando o porque.
Responda APENAS JSON valido, sem texto em volta, no formato:
[{"id": "<id>", "motivo": "<frase curta>"}]`;

  const user = `Busca: "${query}"

Candidatos:
${lista}

Devolva o JSON com ate ${TOP_N_RERANK} itens, ordenados por relevancia.`;

  const apiKey = await getAnthropicKey();
  if (!apiKey) return null;

  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), RERANK_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(tid);
    if (!res.ok) {
      console.error(
        "[buscar-emails] Claude rerank falhou",
        res.status,
        await res.text(),
      );
      return null;
    }
    const data = await res.json();
    const txt: string = data.content?.[0]?.text ?? "";
    return parseRerankJson(txt);
  } catch (err) {
    clearTimeout(tid);
    console.error("[buscar-emails] Claude rerank erro", err);
    return null;
  }
}

function parseRerankJson(txt: string): RerankItem[] | null {
  const limpo = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(limpo);
    if (Array.isArray(parsed)) return sanitizeRerank(parsed);
  } catch {
    // tenta extrair primeiro array
    const m = limpo.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return sanitizeRerank(parsed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function sanitizeRerank(arr: unknown[]): RerankItem[] {
  const out: RerankItem[] = [];
  for (const item of arr) {
    if (
      item &&
      typeof item === "object" &&
      "id" in item &&
      typeof (item as { id: unknown }).id === "string"
    ) {
      const rec = item as { id: string; motivo?: unknown };
      const motivo =
        typeof rec.motivo === "string" && rec.motivo.trim().length > 0
          ? rec.motivo.trim()
          : "Selecionado pelo rerank";
      out.push({ id: rec.id, motivo });
    }
  }
  return out;
}

async function getAnthropicKey(): Promise<string | null> {
  try {
    // Mesmo loader usado em claude-helpers.ts; nao chamamos claudeChat()
    // direto porque ele forca o modelo sonnet — aqui queremos haiku (rerank).
    const dbKey = await getConfig("ANTHROPIC_API_KEY");
    if (dbKey) return dbKey;
    const cfg = await getIntegrationConfig();
    return cfg.ANTHROPIC_API_KEY ?? null;
  } catch (err) {
    console.error("[buscar-emails] sem ANTHROPIC_API_KEY", err);
    return null;
  }
}

export async function buscarEmails(
  userId: string,
  query: string,
  filtros?: FiltrosBusca,
): Promise<{
  resultados: ResultadoBusca[];
  total: number;
  rerankUsado: boolean;
}> {
  const queryNorm = query.trim();
  if (queryNorm.length === 0) {
    return { resultados: [], total: 0, rerankUsado: false };
  }

  const candidatos = await buscarPostgres(userId, queryNorm, filtros);
  if (candidatos.length === 0) {
    return { resultados: [], total: 0, rerankUsado: false };
  }

  const rerank = await rerankComClaude(queryNorm, candidatos);

  if (rerank && rerank.length > 0) {
    const porId = new Map(candidatos.map((c) => [c.id, c] as const));
    const resultados: ResultadoBusca[] = [];
    for (const r of rerank) {
      const c = porId.get(r.id);
      if (!c) continue;
      resultados.push({
        id: c.id,
        assunto: c.assunto,
        remetente: c.remetente,
        snippet: c.snippet,
        recebidoEm: c.classificadoEm.toISOString(),
        link: gmailLink(c.externoId),
        clienteVinculadoId: c.clienteVinculadoId ?? undefined,
        motivo: r.motivo,
      });
      if (resultados.length >= TOP_N_RERANK) break;
    }
    if (resultados.length > 0) {
      return {
        resultados,
        total: candidatos.length,
        rerankUsado: true,
      };
    }
    // rerank devolveu ids invalidos — cai pro fallback
  }

  // Fallback: top 20 do Postgres como motivo padronizado.
  const fallback: ResultadoBusca[] = candidatos.map((c) => ({
    id: c.id,
    assunto: c.assunto,
    remetente: c.remetente,
    snippet: c.snippet,
    recebidoEm: c.classificadoEm.toISOString(),
    link: gmailLink(c.externoId),
    clienteVinculadoId: c.clienteVinculadoId ?? undefined,
    motivo: "ranking basico (Claude indisponivel)",
  }));
  return {
    resultados: fallback,
    total: candidatos.length,
    rerankUsado: false,
  };
}
