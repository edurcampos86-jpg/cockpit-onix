import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncPostToCalendar } from "@/lib/integrations/google-calendar";
import { guardAdminApi } from "@/lib/api-admin-guard";

/**
 * POST /api/integracoes/google/sync
 * Sincroniza posts agendados com o Google Calendar do autor de cada post.
 *
 * Refactor Fase 2 (2026-05): cada post vai pro calendar do seu authorId
 * (UserGoogleAuth). Posts cujo autor nao conectou Google sao pulados.
 */
export async function POST() {
  // A varredura NÃO é per-user: o findMany abaixo pega TODO post da janela,
  // sem filtro por autor, e grava evento no Google Calendar de cada autor
  // (createCalendarEvent(post.authorId, ...)) além de atualizar a linha Post.
  // Com só `if (!session)`, qualquer pessoa do time disparava escrita na
  // agenda alheia. A rota irmã de Outlook (outlook-web/sync) já exigia admin —
  // esta era a inconsistente.
  const negado = await guardAdminApi("google/sync");
  if (negado) return negado;

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
