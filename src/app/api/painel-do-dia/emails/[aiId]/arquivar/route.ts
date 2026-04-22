import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/painel-do-dia/emails/[aiId]/arquivar
 * Marca o e-mail classificado como arquivado (some da UI do painel).
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
  const existente = await prisma.painelEmailAI.findFirst({
    where: { id: aiId, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrado" }, { status: 404 });
  }
  const r = await prisma.painelEmailAI.update({
    where: { id: aiId },
    data: { arquivado: true },
  });
  return NextResponse.json(r);
}
