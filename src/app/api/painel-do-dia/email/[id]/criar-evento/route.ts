import { NextResponse } from "next/server";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import {
  getGoogleClientForUser,
  GoogleNotConnectedError,
} from "@/lib/integrations/google-user-oauth";
import type { EventoSugerido } from "@/lib/painel-do-dia/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/email/[id]/criar-evento
 *
 * Cria o evento no Google Calendar a partir do `eventoSugeridoJson` que a
 * triagem (triar-emails.ts) detectou. Marca `eventoProcessado=true` para
 * sumir do bloco "Eventos sugeridos por e-mail".
 *
 * Defesa em profundidade: a UI já não mostra o card depois de processado,
 * mas idempotência é garantida pelo check `eventoProcessado=true` no início.
 *
 * Resposta 200: { eventId, htmlLink, eventoProcessado: true }
 *  401 sem sessão
 *  400 se eventoSugeridoJson é null OU eventoProcessado já é true
 *  404 se o id não pertence ao usuário
 *  502 se a chamada ao Calendar falhar (evento NÃO é marcado processado)
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const email = await prisma.painelEmailAI.findFirst({
    where: { id, userId: session.userId },
  });
  if (!email) {
    return NextResponse.json({ error: "email AI nao encontrado" }, { status: 404 });
  }
  if (email.eventoProcessado) {
    return NextResponse.json(
      { error: "evento ja processado" },
      { status: 400 }
    );
  }
  if (!email.eventoSugeridoJson) {
    return NextResponse.json(
      { error: "este email nao tem evento sugerido" },
      { status: 400 }
    );
  }

  // O JSON foi sanitizado em triar-emails.ts antes de salvar, então
  // confiamos nos campos. Mesmo assim, defendemos contra corrupção.
  const sugerido = email.eventoSugeridoJson as unknown as EventoSugerido;
  if (
    !sugerido?.titulo ||
    !sugerido?.inicioISO ||
    !sugerido?.fimISO
  ) {
    return NextResponse.json(
      { error: "evento sugerido invalido" },
      { status: 400 }
    );
  }

  let client;
  try {
    client = await getGoogleClientForUser(session.userId);
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: "conta Google nao conectada" },
        { status: 400 }
      );
    }
    throw err;
  }

  const calendar = google.calendar({ version: "v3", auth: client });
  const participantes = Array.isArray(sugerido.participantes)
    ? sugerido.participantes.filter(
        (p): p is string => typeof p === "string" && p.includes("@")
      )
    : [];

  const descricao =
    `Criado automaticamente a partir do e-mail "${email.assunto}".\n` +
    `Remetente: ${email.remetente}\n` +
    `Trecho: ${email.snippet}`;

  try {
    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: `[via e-mail] ${sugerido.titulo}`,
        description: descricao,
        start: {
          dateTime: sugerido.inicioISO,
          timeZone: "America/Bahia",
        },
        end: { dateTime: sugerido.fimISO, timeZone: "America/Bahia" },
        attendees: participantes.map((email) => ({ email })),
        location: sugerido.local,
      },
    });

    await prisma.painelEmailAI.update({
      where: { id },
      data: { eventoProcessado: true },
    });

    return NextResponse.json({
      eventId: res.data.id ?? null,
      htmlLink: res.data.htmlLink ?? null,
      eventoProcessado: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "falha ao criar evento";
    console.error("[criar-evento]", id, msg);
    return NextResponse.json(
      { error: `Calendar API: ${msg}` },
      { status: 502 }
    );
  }
}
