import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncPostToCalendar } from "@/lib/integrations/google-calendar";
import { getSession } from "@/lib/session";

/**
 * POST /api/integracoes/google/sync
 * Sincroniza posts agendados com o Google Calendar do autor de cada post.
 *
 * Refactor Fase 2 (2026-05): cada post vai pro calendar do seu authorId
 * (UserGoogleAuth). Posts cujo autor nao conectou Google sao pulados.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { success: false, message: "Não autenticado" },
      { status: 401 },
    );
  }

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
  let skipped = 0;

  for (const post of posts) {
    try {
      const eventId = await syncPostToCalendar({
        id: post.id,
        authorId: post.authorId,
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
      } else {
        // autor sem Google conectado ou sem escopo write — pulou silenciosamente
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  return NextResponse.json({
    success: true,
    message: `Sincronizados ${synced} posts${skipped > 0 ? ` · ${skipped} pulados (autor sem Google)` : ""}${errors > 0 ? ` · ${errors} erros` : ""}`,
    synced,
    skipped,
    errors,
    total: posts.length,
  });
}
