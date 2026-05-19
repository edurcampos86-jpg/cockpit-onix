import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/email/[id]/ignorar-evento
 *
 * Marca a sugestão de evento como processada sem criar nada no Calendar.
 * O card some do bloco "Eventos sugeridos por e-mail".
 *
 *  401 sem sessão
 *  400 se eventoSugeridoJson é null OU eventoProcessado já é true
 *  404 se o id não pertence ao usuário
 *  200 → { eventoProcessado: true }
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const email = await prisma.painelEmailAI.findFirst({
    where: { id, userId: session.userId },
  });
  if (!email) {
    return NextResponse.json({ error: "email AI nao encontrado" }, { status: 404 });
  }
  if (email.eventoProcessado) {
    return NextResponse.json(
      { error: "evento ja processado" },
      { status: 400 }
    );
  }
  if (!email.eventoSugeridoJson) {
    return NextResponse.json(
      { error: "este email nao tem evento sugerido" },
      { status: 400 }
    );
  }

  await prisma.painelEmailAI.update({
    where: { id },
    data: { eventoProcessado: true },
  });

  return NextResponse.json({ eventoProcessado: true });
}
