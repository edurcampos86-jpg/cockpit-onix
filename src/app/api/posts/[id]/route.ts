import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { author: true, script: true, tasks: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  // Regra 80/20: validar CTA explícito ao alterar
  if (body.ctaType === "explicito" || body.scheduledDate) {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (existing) {
      const ctaType = body.ctaType ?? existing.ctaType;
      const schedDate = body.scheduledDate ? new Date(body.scheduledDate) : existing.scheduledDate;

      if (ctaType === "explicito" && schedDate) {
        const dayStart = new Date(schedDate.getFullYear(), schedDate.getMonth(), schedDate.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const explicitCount = await prisma.post.count({
          where: {
            ctaType: "explicito",
            scheduledDate: { gte: dayStart, lt: dayEnd },
            id: { not: id },
          },
        });

        if (explicitCount >= 1) {
          return NextResponse.json(
            { error: "CTA_LIMIT", message: "Já existe 1 CTA Explícito neste dia. Regra 80/20: máximo 1 CTA Explícito por dia." },
            { status: 422 }
          );
        }
      }
    }
  }

  const post = await prisma.post.update({
    where: { id },
    data: body,
    include: { author: { select: { name: true } }, tasks: true },
  });

  // Auto-completar tarefas do pipeline quando status avança
  if (body.status) {
    const statusToTaskType: Record<string, string[]> = {
      roteiro_pronto: ["roteiro"],
      gravado: ["roteiro", "gravacao"],
      editado: ["roteiro", "gravacao", "edicao"],
      agendado: ["roteiro", "gravacao", "edicao"],
      publicado: ["roteiro", "gravacao", "edicao", "publicacao"],
    };

    const typesToComplete = statusToTaskType[body.status];
    if (typesToComplete) {
      await prisma.task.updateMany({
        where: {
          postId: id,
          type: { in: typesToComplete },
          status: { not: "concluida" },
        },
        data: { status: "concluida", completedAt: new Date() },
      });
    }
  }

  // Sincronizar com Google Calendar se data/hora/status mudou
  if (body.scheduledDate || body.scheduledTime || body.status || body.title) {
    try {
      const { syncPostToCalendar } = await import("@/lib/integrations/google-calendar");
      const eventId = await syncPostToCalendar({
        id: post.id,
        title: post.title,
        format: post.format,
        category: post.category,
        status: post.status,
        scheduledDate: post.scheduledDate,
        scheduledTime: post.scheduledTime,
        ctaType: post.ctaType,
        googleCalendarEventId: post.googleCalendarEventId,
      });
      if (eventId && eventId !== post.googleCalendarEventId) {
        await prisma.post.update({
          where: { id },
          data: { googleCalendarEventId: eventId },
        });
      }
    } catch (err) {
      console.error("[Google Calendar] Erro ao atualizar evento:", err);
    }
  }

  return NextResponse.json(post);
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Remover evento do Google Calendar antes de deletar o post
  const postToDelete = await prisma.post.findUnique({ where: { id }, select: { googleCalendarEventId: true } });
  if (postToDelete?.googleCalendarEventId) {
    try {
      const { removePostFromCalendar } = await import("@/lib/integrations/google-calendar");
      await removePostFromCalendar(postToDelete.googleCalendarEventId);
    } catch (err) {
      console.error("[Google Calendar] Erro ao remover evento:", err);
    }
  }

  // Deletar tarefas vinculadas antes do post (evita erro de FK)
  await prisma.task.deleteMany({ where: { postId: id } });

  // Desvincular roteiro (se houver) sem deletá-lo
  await prisma.post.update({
    where: { id },
    data: { scriptId: null },
  }).catch(() => {
    // Post pode já não existir — ignora
  });

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
