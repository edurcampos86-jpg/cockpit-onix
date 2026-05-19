import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchAgendaDoDia } from "@/lib/painel-do-dia/google-fetch";
import { GoogleNotConnectedError } from "@/lib/integrations/google-user-oauth";
import { hojeBahia } from "@/lib/painel-do-dia/agregador";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/painel-do-dia/agenda?data=YYYY-MM-DD
 * Eventos do Google Calendar do usuário logado para o dia (default: hoje Bahia).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "painel.agenda");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de requisições excedido. Tente em alguns minutos." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const url = new URL(request.url);
  const data = url.searchParams.get("data") ?? hojeBahia();

  try {
    const eventos = await fetchAgendaDoDia(session.userId, data);
    return NextResponse.json(
      {
        connected: true,
        source: "google",
        data,
        fetchedAt: new Date().toISOString(),
        eventos,
      },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { connected: false, source: "google", eventos: [] },
        { status: 200, headers: rateLimitHeaders(limit) },
      );
    }
    const msg = err instanceof Error ? err.message : "Erro ao buscar agenda";
    return NextResponse.json(
      { connected: true, source: "google", error: msg, eventos: [] },
      { status: 502, headers: rateLimitHeaders(limit) },
    );
  }
}
