import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { generateEditorialPlan, type PlannedPost } from "@/lib/integrations/claude-ai";
import { getThemesForPeriod } from "@/lib/seasonal-themes";
import { getSession } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const period: 30 | 60 = body.period === 60 ? 60 : 30;
    const themeOverride: string | undefined = body.themeOverride || undefined;

    // Calcular datas: começar na próxima segunda-feira
    const now = new Date();
    const startDate = new Date(now);
    const dow = startDate.getDay();
    const daysUntilMonday = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    startDate.setDate(startDate.getDate() + daysUntilMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + period - 1);
    endDate.setHours(23, 59, 59, 999);

    const startISO = startDate.toISOString().split("T")[0];
    const endISO = endDate.toISOString().split("T")[0];

    // Obter temas sazonais
    const themes = getThemesForPeriod(startDate, endDate);
    const seasonalContext = themes
      .map((t) => `**${getMonthName(t.month)}:** ${t.theme}\n  Tópicos: ${t.topics.join(", ")}\n  Arcos semanais: ${t.weeklyArcs.join(" → ")}`)
      .join("\n\n");

    // Gerar planejamento com Claude AI
    const posts = await generateEditorialPlan({
      period,
      startDate: startISO,
      endDate: endISO,
      seasonalContext,
      themeOverride,
    });

    // Criar posts, scripts e tasks no banco
    let postsCreated = 0;

    for (const planned of posts) {
      try {
        // Criar script
        const script = await prisma.script.create({
          data: {
            title: planned.title,
            category: planned.category,
            hook: planned.hook,
            body: planned.body,
            cta: planned.cta,
            ctaType: planned.ctaType,
            estimatedTime: planned.estimatedTime,
            hashtags: planned.hashtags,
            isTemplate: false,
            authorId: session.userId,
          },
        });

        // Criar post
        // Horários validados por dados de performance (Analytics semana 26/03-02/04/2026)
        // P4 (TBT quinta) performa melhor às 20:00 | P2 (Reel terça) às 12:00 | P4 (bastidores sábado) às 09:00
        const dateObj = new Date(planned.date + "T00:00:00");
        const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Seg, 2=Ter, 3=Qua, 4=Qui, 5=Sex, 6=Sáb
        let bestTime = "12:00";
        if (dayOfWeek === 4 && planned.category === "P4") {
          bestTime = "20:00"; // TBT quinta às 20h
        } else if (dayOfWeek === 6) {
          bestTime = "09:00"; // Bastidores sábado às 9h
        } else if (dayOfWeek === 2 && planned.category === "P2") {
          bestTime = "12:00"; // Onix em Ação terça ao meio-dia
        }
        const scheduledDate = new Date(planned.date + `T${bestTime}:00`);
        const post = await prisma.post.create({
          data: {
            title: planned.title,
            format: planned.format,
            category: planned.category,
            status: "rascunho",
            scheduledDate,
            scheduledTime: bestTime,
            ctaType: planned.ctaType,
            hashtags: planned.hashtags,
            notes: `Arco: ${planned.weekTheme} | Tema: ${planned.monthTheme}`,
            authorId: session.userId,
            scriptId: script.id,
          },
        });

        // Criar tarefas do pipeline
        const taskDefs = [
          { title: `Escrever roteiro: ${post.title}`, type: "roteiro", dayOffset: -3 },
          { title: `Gravar: ${post.title}`, type: "gravacao", dayOffset: -2 },
          { title: `Editar: ${post.title}`, type: "edicao", dayOffset: -1 },
          { title: `Publicar: ${post.title}`, type: "publicacao", dayOffset: 0 },
        ];

        const tasks = taskDefs.map((def) => {
          const dueDate = new Date(scheduledDate);
          dueDate.setDate(scheduledDate.getDate() + def.dayOffset);
          return {
            title: def.title,
            type: def.type,
            status: "pendente",
            priority: "media",
            dueDate,
            assigneeId: session.userId,
            postId: post.id,
          };
        });

        await prisma.task.createMany({ data: tasks });
        postsCreated++;
      } catch (err) {
        console.error(`Erro ao criar post "${planned.title}":`, err);
      }
    }

    return NextResponse.json({
      postsCreated,
      totalPlanned: posts.length,
      period,
      startDate: startISO,
      endDate: endISO,
      themes: themes.map((t) => t.theme),
    });
  } catch (error) {
    console.error("Erro ao gerar planejamento:", error);
    const message = error instanceof Error ? error.message : "Erro ao gerar planejamento";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getMonthName(month: number): string {
  const names = [
    "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return names[month] || "";
}
