import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { montarEsteira } from "@/lib/grade/esteira";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const original = await prisma.post.findUnique({
      where: { id },
      include: { script: true },
    });

    if (!original) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // Extrair dados opcionais do body (nova data, novo título, etc.)
    let overrides: Record<string, unknown> = {};
    try {
      overrides = await request.json();
    } catch {
      // Body vazio é ok
    }

    const newScheduledDate = overrides.scheduledDate
      ? new Date(overrides.scheduledDate as string)
      : new Date(original.scheduledDate.getTime() + 7 * 24 * 60 * 60 * 1000); // +7 dias por padrão

    // Duplicar o post
    const duplicated = await prisma.post.create({
      data: {
        title: (overrides.title as string) || `${original.title} (cópia)`,
        format: original.format,
        category: original.category,
        status: "rascunho",
        scheduledDate: newScheduledDate,
        scheduledTime: original.scheduledTime,
        ctaType: original.ctaType,
        hashtags: original.hashtags,
        notes: original.notes,
        order: 0,
        authorId: original.authorId,
      },
      include: { author: { select: { name: true } }, tasks: true },
    });

    // Gerar tarefas automáticas para o novo post
    const tasks = montarEsteira({
      tituloDoPost: duplicated.title,
      publicacaoEm: new Date(duplicated.scheduledDate),
    }).map((passo) => ({
      title: passo.title,
      type: passo.type,
      status: "pendente",
      priority: "media",
      dueDate: passo.dueDate,
      assigneeId: duplicated.authorId,
      postId: duplicated.id,
    }));

    await prisma.task.createMany({ data: tasks });

    // Se o post original tinha roteiro, duplicar o roteiro também
    if (original.script) {
      const newScript = await prisma.script.create({
        data: {
          title: `${original.script.title} (cópia)`,
          category: original.script.category,
          hook: original.script.hook,
          body: original.script.body,
          cta: original.script.cta,
          ctaType: original.script.ctaType,
          estimatedTime: original.script.estimatedTime,
          hashtags: original.script.hashtags,
          isTemplate: false,
          authorId: original.authorId,
        },
      });

      await prisma.post.update({
        where: { id: duplicated.id },
        data: { scriptId: newScript.id },
      });
    }

    const finalPost = await prisma.post.findUnique({
      where: { id: duplicated.id },
      include: { author: { select: { name: true } }, tasks: true, script: true },
    });

    return NextResponse.json(finalPost, { status: 201 });
  } catch (error) {
    console.error("Erro ao duplicar post:", error);
    return NextResponse.json({ error: "Erro ao duplicar post" }, { status: 500 });
  }
}
