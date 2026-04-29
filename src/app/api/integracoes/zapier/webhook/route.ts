import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { validateWebhookSecret, normalizePayload } from "@/lib/integrations/zapier";
import { analyzeMeeting } from "@/lib/integrations/claude-ai";
import { zapierPlaudPayloadSchema } from "@/lib/security/schemas";

/**
 * POST /api/integracoes/zapier/webhook
 * Webhook que recebe dados do Plaud.ai via Zapier
 *
 * Fluxo: Plaud grava reunião → Zapier detecta → POST para este endpoint
 *        → Cockpit armazena → Claude AI analisa e extrai insights para roteiros
 *
 * Configuração no Zapier:
 * 1. Trigger: Plaud.ai "New Recording" (ou equivalente)
 * 2. Action: Webhooks by Zapier > POST
 * 3. URL: http://SEU-DOMINIO/api/integracoes/zapier/webhook
 * 4. Headers: x-webhook-secret: (seu secret configurado)
 * 5. Body: enviar transcription, title, date, duration, participants
 */
export async function POST(request: NextRequest) {
  // Validar webhook secret
  const secret = request.headers.get("x-webhook-secret") || "";
  const isValid = await validateWebhookSecret(secret);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const validated = zapierPlaudPayloadSchema.safeParse(rawBody);
    if (!validated.success) {
      return NextResponse.json(
        { error: "payload inválido", issues: validated.error.issues.slice(0, 5) },
        { status: 400 },
      );
    }
    const payload = normalizePayload(validated.data as Record<string, unknown>);

    // Verificar duplicata
    if (payload.external_id) {
      const existing = await prisma.meeting.findFirst({
        where: { externalId: payload.external_id },
      });
      if (existing) {
        return NextResponse.json({
          success: true,
          message: "Reunião já processada",
          meetingId: existing.id,
          duplicate: true,
        });
      }
    }

    // Tentar associar a um lead pelo nome dos participantes
    let leadId: string | null = null;
    if (payload.participants && payload.participants.length > 0) {
      for (const name of payload.participants) {
        const lead = await prisma.lead.findFirst({
          where: { name: { contains: name } },
        });
        if (lead) {
          leadId = lead.id;
          break;
        }
      }
    }

    // Criar registro da reunião
    const meeting = await prisma.meeting.create({
      data: {
        title: payload.title || "Reunião sem título",
        date: new Date(payload.date || Date.now()),
        duration: payload.duration || null,
        participants: payload.participants?.join(", ") || null,
        vendedor: payload.vendedor || null,
        transcription: payload.transcription || null,
        summary: payload.summary || null,
        actionItems: payload.action_items ? JSON.stringify(payload.action_items) : null,
        source: "plaud",
        externalId: payload.external_id || null,
        audioUrl: payload.audio_url || null,
        leadId,
      },
    });

    // Se tem transcrição, analisar com Claude AI em background
    let aiInsights = null;
    if (payload.transcription && payload.transcription.length > 100) {
      try {
        aiInsights = await analyzeMeeting({
          title: meeting.title,
          transcription: payload.transcription,
          summary: payload.summary,
          participants: meeting.participants,
        });

        // Atualizar meeting com insights
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: {
            summary: aiInsights.summary,
            insights: aiInsights.insights,
            actionItems: aiInsights.actionItems,
          },
        });
      } catch (error) {
        console.error("Erro ao analisar com Claude AI:", error);
        // Não falha o webhook por causa da IA
      }
    }

    return NextResponse.json({
      success: true,
      meetingId: meeting.id,
      analyzed: !!aiInsights,
      message: aiInsights
        ? "Reunião recebida e analisada pela IA"
        : "Reunião recebida (sem transcrição suficiente para análise)",
    }, { status: 201 });

  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { success: false, error: "Erro interno" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integracoes/zapier/webhook
 * Verifica se o webhook está ativo (usado pelo Zapier para testar)
 */
export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Cockpit Onix - Plaud.ai Webhook",
    accepts: "POST with JSON body containing meeting transcription data",
  });
}
