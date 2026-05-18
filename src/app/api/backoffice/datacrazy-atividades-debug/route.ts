import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { VENDEDORES_CONFIG } from "@/lib/datacrazy";

/**
 * GET /api/backoffice/datacrazy-atividades-debug
 *
 * Endpoint de DEBUG (não persiste nada). Chama a API Datacrazy
 * /activities e retorna o response RAW pra Eduardo analisar quando o
 * sync principal retornar 0 atividades.
 *
 * Query params (todos opcionais):
 *   - attendantId  passa filtro de attendantId. Sem isso, busca TODAS.
 *   - take         (default 10)
 *   - startDateGte ISO (default 30 dias atrás)
 *   - withFilter   "true" = aplica filtros, "false" = chama sem filtro (default false)
 *   - baseUrl      override do host (default api.g1.datacrazy.io)
 *
 * Retorna:
 *   - request: { url, headers (Authorization masked) }
 *   - response: { status, statusText, headers, body }
 *
 * Útil pra descobrir se o problema é:
 *   - Host errado (status diferente de 200)
 *   - attendantId formato errado (200 mas array vazio quando passa, item quando não passa)
 *   - Token sem permissão (401/403)
 *   - API mudou (200 mas shape diferente)
 *
 * Requer admin.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas admin pode rodar debug" },
      { status: 403 },
    );
  }

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json(
      { error: "DATACRAZY_TOKEN não configurado" },
      { status: 400 },
    );
  }

  const attendantIdParam = req.nextUrl.searchParams.get("attendantId");
  const take = req.nextUrl.searchParams.get("take") ?? "10";
  const startDateGte = req.nextUrl.searchParams.get("startDateGte");
  const withFilter = req.nextUrl.searchParams.get("withFilter") === "true";
  const baseUrl =
    req.nextUrl.searchParams.get("baseUrl") ?? "https://api.g1.datacrazy.io/api/v1";

  const params = new URLSearchParams();
  params.set("take", take);
  params.set("skip", "0");

  if (withFilter) {
    const attendantId =
      attendantIdParam ?? VENDEDORES_CONFIG["Eduardo Campos"].attendantId;
    params.set("filter[attendantId]", attendantId);
    if (startDateGte) {
      params.set("filter[startDate]", startDateGte);
    }
  }

  const url = `${baseUrl}/activities?${params.toString()}`;
  const tokenPreview = `${token.slice(0, 6)}…${token.slice(-4)} (len=${token.length})`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json({
      request: { url, tokenPreview },
      error: e instanceof Error ? e.message : "?",
    });
  }

  const status = res.status;
  const statusText = res.statusText;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });

  let body: unknown;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = await res.json();
    } catch (e) {
      body = { __parseError: e instanceof Error ? e.message : "?" };
    }
  } else {
    body = await res.text();
  }

  // Estatísticas rápidas pra facilitar leitura
  let counts: Record<string, unknown> = {};
  if (Array.isArray(body)) {
    counts = {
      type: "array",
      length: body.length,
      sample: body.slice(0, 2),
    };
  } else if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const dataArr = (b.data ?? b.items) as unknown[] | undefined;
    if (Array.isArray(dataArr)) {
      counts = {
        type: "object-wrapper",
        topLevelKeys: Object.keys(b),
        dataLength: dataArr.length,
        sample: dataArr.slice(0, 2),
      };
    } else {
      counts = {
        type: "object-other",
        topLevelKeys: Object.keys(b),
      };
    }
  } else {
    counts = { type: typeof body };
  }

  return NextResponse.json({
    request: {
      url,
      method: "GET",
      tokenPreview,
      withFilter,
      attendantIdUsado: withFilter
        ? attendantIdParam ?? VENDEDORES_CONFIG["Eduardo Campos"].attendantId
        : "(nenhum — busca tudo)",
    },
    response: {
      status,
      statusText,
      ok: res.ok,
      headers,
      counts,
      body,
    },
  });
}
