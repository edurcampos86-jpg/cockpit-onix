import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = (await request.json()) as { dispensada?: boolean };

  const existente = await prisma.painelRetrospectiva.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const upd = await prisma.painelRetrospectiva.update({
    where: { id },
    data: { dispensada: body.dispensada ?? true },
  });
  return NextResponse.json(upd);
}
