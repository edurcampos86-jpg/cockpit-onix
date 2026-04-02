import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncPostToCalendar } from "@/lib/integrations/google-calendar";
import { isConfigured } from "@/lib/integrations/config";

/**
 * POST /api/integracoes/google/sync
 * Sincroniza posts agendados com o Google Calendar
 */
export async function POST() {
  try {
    const hasRefreshToken = await isConfigured("GOOGLE_REFRESH_TOKEN");
    if (!hasRefreshToken) {
      return NextResponse.json(
        { success: false, message: "Google Calendar não autorizado. Clique em 'Autorizar Google' primeiro." },
        { status: 400 }
      );
    }

    // Buscar posts das próximas 4 semanas que não têm evento no Google Calendar
    const now = new Date();
    const fourWeeksLater = new Date(now);
    fourWeeksLater.setDate(now.getDate() + 28);

    const posts = await prisma.post.findMany({
      where: {
        scheduledDate: { gte: now, lte: fourWeeksLater },
        googleCalendarEventId: null,
        status: { not: "publicado" },
      },
      orderBy: { scheduledDate: "asc" },
    });

    let synced = 0;
    let errors = 0;

    for (const post of posts) {
      try {
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

        if (eventId) {
          await prisma.post.update({
            where: { id: post.id },
            data: { googleCalendarEventId: eventId },
          });
          synced++;
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronizados ${synced} posts com o Google Calendar${errors > 0 ? ` (${errors} erros)` : ""}`,
      synced,
      errors,
      total: posts.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Erro ao sincronizar" },
      { status: 500 }
    );
  }
}
