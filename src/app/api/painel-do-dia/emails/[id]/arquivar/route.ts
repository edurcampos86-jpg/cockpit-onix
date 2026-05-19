import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { arquivarEmailAI } from "@/lib/painel-do-dia/triar-emails";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/emails/[id]/arquivar
 *
 * Marca o PainelEmailAI como arquivado=true. O agregador filtra arquivados,
 * entao o e-mail some do bloco "E-mails que pedem acao". Util para spam/fyi
 * que o Claude classifica mas o usuario nao quer ver.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "painel.emails.mutate");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de requisições excedido." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const { id } = await params;
  try {
    await arquivarEmailAI(session.userId, id);
    return NextResponse.json(
      { ok: true },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao arquivar";
    const status = msg.includes("nao encontrado") ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: msg },
      { status, headers: rateLimitHeaders(limit) },
    );
  }
}
