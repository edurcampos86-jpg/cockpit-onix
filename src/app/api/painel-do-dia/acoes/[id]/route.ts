import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { AtualizarAcaoInput } from "@/lib/painel-do-dia/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as AtualizarAcaoInput;

  const existente = await prisma.acaoPainel.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const precisaSync = existente.origem !== "cockpit";

  const atualizada = await prisma.acaoPainel.update({
    where: { id },
    data: {
      titulo: body.titulo ?? undefined,
      concluida: body.concluida ?? undefined,
      vence:
        body.vence === undefined
          ? undefined
          : body.vence
            ? new Date(body.vence)
            : null,
      importante: body.importante ?? undefined,
      noMeuDia: body.noMeuDia ?? undefined,
      quadrante: body.quadrante ?? undefined,
      pendingSync: precisaSync ? true : undefined,
      syncOp: precisaSync ? "update" : undefined,
      syncError: precisaSync ? null : undefined,
    },
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
  const existente = await prisma.acaoPainel.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  // Acao local: delete direto. Externa: marca syncOp=delete para o cowork remover na origem.
  if (existente.origem === "cockpit") {
    await prisma.acaoPainel.delete({ where: { id } });
    return NextResponse.json({ id, deletada: true });
  }

  const marcada = await prisma.acaoPainel.update({
    where: { id },
    data: { pendingSync: true, syncOp: "delete", syncError: null },
  });
  return NextResponse.json({ id: marcada.id, pendingDelete: true });
}
