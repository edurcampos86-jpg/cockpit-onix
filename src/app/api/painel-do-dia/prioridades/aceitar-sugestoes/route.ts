import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { data?: string };
  if (!body.data) {
    return NextResponse.json({ error: "data obrigatoria" }, { status: 400 });
  }

  const result = await prisma.painelPrioridade.updateMany({
    where: { userId: session.userId, data: body.data, sugeridaPorBoot: true },
    data: { sugeridaPorBoot: false, bootMotivo: null },
  });

  return NextResponse.json({ aceitas: result.count });
}
