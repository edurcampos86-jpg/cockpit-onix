import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { criarAcaoDeEmail } from "@/lib/painel-do-dia/triar-emails";

/**
 * POST /api/painel-do-dia/emails/[aiId]/criar-acao
 * Converte um e-mail classificado pela IA numa AcaoPainel respeitando
 * o quadrante/prazo/cliente sugeridos.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ aiId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { aiId } = await params;
  try {
    const out = await criarAcaoDeEmail(session.userId, aiId);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "erro" },
      { status: 400 }
    );
  }
}
