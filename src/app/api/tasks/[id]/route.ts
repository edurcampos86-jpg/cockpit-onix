import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const body = await request.json();

    // Montar objeto de update com campos permitidos
    const data: Record<string, unknown> = {};
    if (body.status !== undefined) {
      data.status = body.status;
      if (body.status === "concluida") {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.type !== undefined) data.type = body.type;

    const task = await prisma.task.update({
      where: { id },
      data,
    });
    return NextResponse.json(task);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    if (msg.includes("Record to update not found") || msg.includes("P2025")) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
    }
    console.error("Erro ao atualizar tarefa:", error);
    return NextResponse.json({ error: "Erro ao atualizar tarefa" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await prisma.task.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro desconhecido";
    if (msg.includes("Record to delete does not exist") || msg.includes("P2025")) {
      return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });
    }
    console.error("Erro ao deletar tarefa:", error);
    return NextResponse.json({ error: "Erro ao deletar tarefa" }, { status: 500 });
  }
}
