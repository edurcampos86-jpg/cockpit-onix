import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { analyzeMeeting, suggestScriptFromMeeting } from "@/lib/integrations/claude-ai";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: { lead: true },
  });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(meeting);
}

/**
 * POST /api/meetings/[id]
 * Ações sobre uma reunião:
 * - { action: "analyze" } — Re-analisar com Claude AI
 * - { action: "generate_script", category: "..." } — Gerar roteiro a partir dos insights
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "analyze") {
    if (!meeting.transcription) {
      return NextResponse.json({ error: "Sem transcrição para analisar" }, { status: 400 });
    }

    const result = await analyzeMeeting({
      title: meeting.title,
      transcription: meeting.transcription,
      summary: meeting.summary,
      participants: meeting.participants,
    });

    await prisma.meeting.update({
      where: { id },
      data: {
        summary: result.summary,
        insights: result.insights,
        actionItems: result.actionItems,
      },
    });

    return NextResponse.json({ success: true, ...result });
  }

  if (body.action === "generate_script") {
    const category = body.category || "onix_pratica";

    if (!meeting.insights && !meeting.transcription) {
      return NextResponse.json({ error: "Sem insights ou transcrição" }, { status: 400 });
    }

    // Se não tem insights, analisar primeiro
    let insights = meeting.insights;
    if (!insights && meeting.transcription) {
      const analysis = await analyzeMeeting({
        title: meeting.title,
        transcription: meeting.transcription,
        summary: meeting.summary,
        participants: meeting.participants,
      });
      insights = analysis.insights;
      await prisma.meeting.update({
        where: { id },
        data: {
          summary: analysis.summary,
          insights: analysis.insights,
          actionItems: analysis.actionItems,
        },
      });
    }

    const script = await suggestScriptFromMeeting(category, insights!, meeting.title);
    return NextResponse.json({ success: true, script, category });
  }

  return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
}
