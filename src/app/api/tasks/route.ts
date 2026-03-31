import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const PRIORITY_ORDER: Record<string, number> = {
  urgente: 0,
  alta: 1,
  media: 2,
  baixa: 3,
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status");
  const assigneeId = searchParams.get("assigneeId");
  const today = searchParams.get("today");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (assigneeId) where.assigneeId = assigneeId;
  if (today === "true") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.dueDate = { gte: start, lte: end };
  }

  try {
    const tasks = await prisma.task.findMany({
      where,
      include: { assignee: { select: { name: true } }, post: { select: { title: true, category: true } } },
      orderBy: [{ dueDate: "asc" }],
    });

    // Ordenar por prioridade real (urgente > alta > media > baixa) e depois por data
    tasks.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return 0; // dueDate já ordenada pelo Prisma
    });

    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Erro ao buscar tarefas:", error);
    return NextResponse.json({ error: "Erro ao buscar tarefas" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validação dos campos obrigatórios
    if (!body.title || !body.assigneeId) {
      return NextResponse.json(
        { error: "Campos obrigatórios: title, assigneeId" },
        { status: 400 }
      );
    }

    const task = await prisma.task.create({
      data: {
        title: body.title,
        description: body.description || null,
        status: body.status || "pendente",
        priority: body.priority || "media",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        type: body.type || "geral",
        assigneeId: body.assigneeId,
        postId: body.postId || null,
      },
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar tarefa:", error);
    return NextResponse.json({ error: "Erro ao criar tarefa" }, { status: 500 });
  }
}
