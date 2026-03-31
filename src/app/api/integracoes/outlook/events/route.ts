import { NextRequest, NextResponse } from "next/server";
import * as outlook from "@/lib/integrations/outlook";

/**
 * GET /api/integracoes/outlook/events?start=...&end=...
 * Lista eventos do calendário Outlook
 */
export async function GET(request: NextRequest) {
  try {
    const start = request.nextUrl.searchParams.get("start");
    const end = request.nextUrl.searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json({ error: "start e end são obrigatórios" }, { status: 400 });
    }

    const result = await outlook.listEvents(start, end);
    return NextResponse.json(result.value || []);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/integracoes/outlook/events
 * Criar evento no Outlook a partir de um post
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, postTitle, scheduledDate, scheduledTime } = body;

    let eventData;
    if (type === "recording") {
      eventData = outlook.createRecordingEvent(postTitle, scheduledDate);
    } else {
      eventData = outlook.createPostPublicationEvent(postTitle, scheduledDate, scheduledTime);
    }

    const event = await outlook.createEvent(eventData);
    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
