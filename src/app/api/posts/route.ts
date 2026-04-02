import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { generateScriptForPost } from "@/lib/integrations/claude-ai";

// POST /api/posts/duplicate — Duplicar um post existente
// Movido para POST handler com flag "duplicateFromId"

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: Record<string, unknown> = {};
  if (startDate && endDate) {
    where.scheduledDate = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  try {
    const posts = await prisma.post.findMany({
      where,
      include: { author: { select: { name: true } }, script: true, tasks: true },
      orderBy: { scheduledDate: "asc" },
    });

    return NextResponse.json(posts);
  } catch (error) {
    console.error("Erro ao buscar posts:", error);
    return NextResponse.json({ error: "Erro ao buscar posts" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { generateTasks, supportUserId, generateScript, topic, ...postData } = body;

    // Validação dos campos obrigatórios
    if (!postData.title || !postData.authorId || !postData.scheduledDate) {
      return NextResponse.json(
        { error: "Campos obrigatórios: title, authorId, scheduledDate" },
        { status: 400 }
      );
    }

    // Regra 80/20: máximo 1 CTA explícito por dia
    if (postData.ctaType === "explicito" && postData.scheduledDate) {
      const date = new Date(postData.scheduledDate);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const explicitCount = await prisma.post.count({
        where: {
          ctaType: "explicito",
          scheduledDate: { gte: dayStart, lt: dayEnd },
        },
      });

      if (explicitCount >= 1) {
        return NextResponse.json(
          { error: "CTA_LIMIT", message: "Já existe 1 CTA Explícito neste dia. Regra 80/20: máximo 1 CTA Explícito por dia." },
          { status: 422 }
        );
      }
    }

    const post = await prisma.post.create({
      data: postData,
      include: { author: { select: { name: true } }, tasks: true },
    });

    // Gerar tarefas automáticas do pipeline editorial
    if (generateTasks !== false && post.scheduledDate) {
      const pubDate = new Date(post.scheduledDate);
      const taskDefinitions = [
        { title: `Escrever roteiro: ${post.title}`, type: "roteiro", dayOffset: -3 },
        { title: `Gravar: ${post.title}`, type: "gravacao", dayOffset: -2 },
        { title: `Editar: ${post.title}`, type: "edicao", dayOffset: -1 },
        { title: `Publicar: ${post.title}`, type: "publicacao", dayOffset: 0 },
      ];

      const tasks = taskDefinitions.map((def) => {
        const dueDate = new Date(pubDate);
        dueDate.setDate(pubDate.getDate() + def.dayOffset);
        return {
          title: def.title,
          type: def.type,
          status: "pendente",
          priority: "media",
          dueDate: dueDate,
          assigneeId: def.type === "edicao" ? (supportUserId || post.authorId) : post.authorId,
          postId: post.id,
        };
      });

      await prisma.task.createMany({ data: tasks });
    }

    // Flow A: Gerar roteiro automaticamente com Claude AI
    let scriptId: string | undefined;
    if (generateScript === true) {
      try {
        const scriptData = await generateScriptForPost({
          title: post.title,
          category: post.category,
          format: post.format,
          topic: topic || undefined,
        });

        const script = await prisma.script.create({
          data: {
            title: post.title,
            category: post.category,
            hook: scriptData.hook,
            body: scriptData.body,
            cta: scriptData.cta,
            ctaType: scriptData.ctaType,
            estimatedTime: scriptData.estimatedTime,
            hashtags: scriptData.hashtags,
            isTemplate: false,
            authorId: post.authorId,
          },
        });

        // Vincular roteiro ao post
        await prisma.post.update({
          where: { id: post.id },
          data: { scriptId: script.id },
        });

        scriptId = script.id;
      } catch (err) {
        // Não falha o post por causa da IA — apenas loga
        console.error("Erro ao gerar roteiro com IA:", err);
      }
    }

    // Sincronizar com Google Calendar (não bloqueia criação do post)
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
        googleCalendarEventId: null,
      });
      if (eventId) {
        await prisma.post.update({
          where: { id: post.id },
          data: { googleCalendarEventId: eventId },
        });
      }
    } catch (err) {
      console.error("[Google Calendar] Erro ao criar evento:", err);
    }

    const finalPost = await prisma.post.findUnique({
      where: { id: post.id },
      include: { author: { select: { name: true } }, tasks: true, script: true },
    });

    return NextResponse.json(
      { ...finalPost, scriptGeneratedByAI: !!scriptId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar post:", error);
    return NextResponse.json({ error: "Erro ao criar post" }, { status: 500 });
  }
}
