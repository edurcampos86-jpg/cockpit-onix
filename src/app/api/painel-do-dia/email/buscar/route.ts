import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buscarEmails, type FiltrosBusca } from "@/lib/painel-do-dia/buscar-emails";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/email/buscar
 *
 * Busca full-text em PainelEmailAI + rerank por Claude (haiku).
 *
 * Body: { query: string, filtros?: { clienteId?, dataDe?, dataAte? } }
 * 401 sem sessao
 * 400 query vazia / payload invalido
 * 200 { resultados, total, rerankUsado }
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "painel.email.buscar", 30);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de buscas excedido. Tente em alguns minutos." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "JSON invalido" },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  const { query, filtros } = parseBody(body);
  if (!query) {
    return NextResponse.json(
      { error: "query obrigatoria" },
      { status: 400, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const out = await buscarEmails(session.userId, query, filtros);
    return NextResponse.json(out, { headers: rateLimitHeaders(limit) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro na busca";
    console.error("[/api/painel-do-dia/email/buscar]", err);
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: rateLimitHeaders(limit) },
    );
  }
}

function parseBody(body: unknown): {
  query: string | null;
  filtros: FiltrosBusca | undefined;
} {
  if (!body || typeof body !== "object") return { query: null, filtros: undefined };
  const rec = body as Record<string, unknown>;
  const queryRaw = typeof rec.query === "string" ? rec.query.trim() : "";
  if (queryRaw.length === 0) return { query: null, filtros: undefined };
  const query = queryRaw.length > 500 ? queryRaw.slice(0, 500) : queryRaw;
  return { query, filtros: parseFiltros(rec.filtros) };
}

function parseFiltros(raw: unknown): FiltrosBusca | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: FiltrosBusca = {};
  if (typeof r.clienteId === "string" && r.clienteId.length > 0) {
    out.clienteId = r.clienteId;
  }
  if (typeof r.dataDe === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dataDe)) {
    out.dataDe = r.dataDe;
  }
  if (typeof r.dataAte === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dataAte)) {
    out.dataAte = r.dataAte;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
