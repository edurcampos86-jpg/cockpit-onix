import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Aceita todas as sugestões do Boot do Dia que ainda estão pendentes.
 * Sug 1.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data } = (await request.json()) as { data?: string };
  if (!data) {
    return NextResponse.json({ error: "data obrigatoria" }, { status: 400 });
  }

  const r = await prisma.painelPrioridade.updateMany({
    where: { userId: session.userId, data, sugeridaPorBoot: true },
    data: { sugeridaPorBoot: false, bootMotivo: null },
  });

  return NextResponse.json({ aceitas: r.count });
}
