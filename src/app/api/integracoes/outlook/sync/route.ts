import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import * as outlook from "@/lib/integrations/outlook";

/**
 * POST /api/integracoes/outlook/sync
 * Sincroniza posts agendados com o calendário do Outlook:
 * - Cria eventos de publicação para posts agendados
 * - Cria eventos de gravação para posts pendentes
 * - Conta reuniões da semana para o KPI do dashboard
 */
export async function POST() {
  try {
    // Buscar posts da semana que precisam de eventos no Outlook
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const posts = await prisma.post.findMany({
      where: {
        scheduledDate: { gte: monday, lte: sunday },
        status: { in: ["rascunho", "roteiro_pronto", "gravado", "editado", "agendado"] },
      },
    });

    let eventsCreated = 0;

    for (const post of posts) {
      const dateStr = new Date(post.scheduledDate).toISOString().split("T")[0];

      // Criar evento de publicação para posts agendados
      if (post.status === "agendado") {
        try {
          await outlook.createEvent(
            outlook.createPostPublicationEvent(post.title, dateStr, post.scheduledTime || "12:00")
          );
          eventsCreated++;
        } catch { /* evento pode já existir */ }
      }

      // Criar evento de gravação para posts que ainda não foram gravados
      if (post.status === "rascunho" || post.status === "roteiro_pronto") {
        const recordDate = new Date(post.scheduledDate);
        recordDate.setDate(recordDate.getDate() - 2);
        const recordDateStr = recordDate.toISOString().split("T")[0];

        // Só criar se a data é no futuro
        if (recordDate > now) {
          try {
            await outlook.createEvent(
              outlook.createRecordingEvent(post.title, recordDateStr)
            );
            eventsCreated++;
          } catch { /* evento pode já existir */ }
        }
      }
    }

    // Contar reuniões da semana (eventos com attendees = reuniões)
    const weekEvents = await outlook.listEvents(monday.toISOString(), sunday.toISOString());
    const meetings = (weekEvents.value || []).filter(
      (e) => e.attendees && e.attendees.length > 0
    );

    return NextResponse.json({
      success: true,
      eventsCreated,
      weekMeetings: meetings.length,
      message: `${eventsCreated} eventos criados no Outlook. ${meetings.length} reuniões esta semana.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Erro ao sincronizar" },
      { status: 500 }
    );
  }
}
