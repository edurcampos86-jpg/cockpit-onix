import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchEmailsAcao } from "@/lib/painel-do-dia/google-fetch";
import { GoogleNotConnectedError } from "@/lib/integrations/google-user-oauth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/painel-do-dia/emails
 * E-mails não lidos das últimas 24h que parecem "pedir ação".
 * Heurística: assunto com '?'  OU  destinatário direto = você  OU  contém
 * palavra-chave (preciso, urgente, favor, quando, aguardo, ...).
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "painel.emails");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de requisições excedido. Tente em alguns minutos." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const emails = await fetchEmailsAcao(session.userId, 10);
    return NextResponse.json(
      {
        connected: true,
        source: "gmail",
        fetchedAt: new Date().toISOString(),
        emails,
      },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { connected: false, source: "gmail", emails: [] },
        { status: 200, headers: rateLimitHeaders(limit) },
      );
    }
    const msg = err instanceof Error ? err.message : "Erro ao buscar e-mails";
    return NextResponse.json(
      { connected: true, source: "gmail", error: msg, emails: [] },
      { status: 502, headers: rateLimitHeaders(limit) },
    );
  }
}
