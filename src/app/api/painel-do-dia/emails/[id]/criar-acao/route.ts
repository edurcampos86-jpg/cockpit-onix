import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { criarAcaoDeEmail } from "@/lib/painel-do-dia/triar-emails";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/emails/[id]/criar-acao
 *
 * Converte um PainelEmailAI classificado pelo Claude em uma AcaoPainel
 * (origem=local) no quadrante sugerido. Marca o e-mail como processado e
 * vincula o id da acao gerada. Idempotente: se ja foi processado, retorna
 * o acaoId existente.
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
    const { acaoId } = await criarAcaoDeEmail(session.userId, id);
    return NextResponse.json(
      { ok: true, acaoId },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao criar ação";
    const status = msg.includes("nao encontrado")
      ? 404
      : msg.includes("nao gera acao")
        ? 400
        : 500;
    return NextResponse.json(
      { ok: false, error: msg },
      { status, headers: rateLimitHeaders(limit) },
    );
  }
}
