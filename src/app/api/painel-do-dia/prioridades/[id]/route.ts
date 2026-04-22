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
  const body = (await request.json()) as {
    texto?: string;
    concluida?: boolean;
    tempoEstimadoMin?: number | null;
    aceitarSugestao?: boolean; // Sug 1: só confirma a sugestao existente
  };

  const existente = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const data: Parameters<typeof prisma.painelPrioridade.update>[0]["data"] = {};
  if (body.texto !== undefined) data.texto = body.texto.trim();
  if (body.concluida !== undefined) data.concluida = body.concluida;
  if (body.tempoEstimadoMin !== undefined)
    data.tempoEstimadoMin = body.tempoEstimadoMin;
  if (body.aceitarSugestao) {
    data.sugeridaPorBoot = false;
    data.bootMotivo = null;
  }

  const atualizada = await prisma.painelPrioridade.update({
    where: { id },
    data,
  });

  return NextResponse.json(atualizada);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existente = await prisma.painelPrioridade.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  await prisma.painelPrioridade.delete({ where: { id } });
  return NextResponse.json({ id, deletada: true });
}
