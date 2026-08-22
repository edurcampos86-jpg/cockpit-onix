import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * POST /api/meetings/sync-drive
 * Recebe transcrições do Google Drive em lote.
 * Body: { meetings: [{ title, content, driveId, createdAt }] }
 *
 * ── A TERCEIRA PORTA ─────────────────────────────────────────────────────
 * Este é o caminho de entrada de transcrição que não aparece na tela de
 * Integrações e que ninguém monitora — os outros dois são o webhook do Zapier
 * e o import manual do Cockpit de Reunião. O comentário original dizia
 * "enviadas pelo frontend ou Zapier": nem quem escreveu sabia quem chama.
 *
 * NÃO está na allowlist do proxy (`src/lib/proxy-rotas.ts`), então sempre
 * exigiu sessão — o gate abaixo torna isso EXPLÍCITO em vez de depender só
 * de configuração em outro arquivo. As reuniões que ela cria nascem SEM
 * `vendedor`, o que, com o escopo de `/api/meetings` ligado, as deixa
 * invisíveis para quem tem escopo restrito.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 403 });

  try {
    const body = await request.json();
    const meetings = body.meetings || [];

    if (!Array.isArray(meetings) || meetings.length === 0) {
      return NextResponse.json({ error: "Nenhuma reunião enviada" }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    const results = [];

    for (const m of meetings) {
      // Verificar duplicata por externalId (driveId)
      if (m.driveId) {
        const existing = await prisma.meeting.findFirst({
          where: { externalId: m.driveId },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Extrair data do título (formato "03-30 Reunião: ...")
      let meetingDate = new Date();
      const dateMatch = m.title?.match(/^(\d{2})-(\d{2})\s/);
      if (dateMatch) {
        const month = parseInt(dateMatch[1]);
        const day = parseInt(dateMatch[2]);
        const year = new Date().getFullYear();
        meetingDate = new Date(year, month - 1, day);
      } else if (m.createdAt) {
        meetingDate = new Date(m.createdAt);
      }

      // Extrair participantes dos speakers na transcrição
      const speakerMatches = m.content?.match(/Speaker \d+/g) || [];
      const uniqueSpeakers = [...new Set(speakerMatches)];
      const participantCount = uniqueSpeakers.length;

      // Estimar duração pela última timestamp
      const timeMatches = m.content?.match(/(\d{2}):(\d{2}):(\d{2})/g) || [];
      let duration = null;
      if (timeMatches.length > 0) {
        const lastTime = timeMatches[timeMatches.length - 1];
        const [h, min] = lastTime.split(":").map(Number);
        duration = h * 60 + min;
      }

      // Limpar título (remover prefixo de data)
      const cleanTitle = m.title?.replace(/^\d{2}-\d{2}\s+/, "") || "Reunião sem título";

      // Tentar associar a um lead pelo título
      let leadId: string | null = null;
      const nameInTitle = cleanTitle.match(/(?:de|com|do|da)\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)/);
      if (nameInTitle) {
        const lead = await prisma.lead.findFirst({
          where: { name: { contains: nameInTitle[1] } },
        });
        if (lead) leadId = lead.id;
      }

      const meeting = await prisma.meeting.create({
        data: {
          title: cleanTitle,
          date: meetingDate,
          duration,
          participants: participantCount > 0 ? `${participantCount} participantes` : null,
          transcription: m.content || null,
          source: "plaud",
          externalId: m.driveId || null,
          leadId,
        },
      });

      imported++;
      results.push({ id: meeting.id, title: cleanTitle });
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      results,
      message: `${imported} reuniões importadas, ${skipped} já existiam.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    );
  }
}
