/**
 * POST /api/integracoes/meta/ingest
 * Ingestão de eventos de tracking vindos do MSP (Pixel/UTM).
 *
 * Auth: Bearer META_INGEST_TOKEN (env Railway; comparação timing-safe).
 * Token ausente no env = 503 (integração desativada) — padrão do
 * endpoint de automação do import XLSX. Rota entra na allowlist do
 * proxy (autentica sozinha, sem cookie de sessão).
 */
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_NAMES = ["PageView", "Lead", "CompleteRegistration", "Schedule"];

function tokenValido(req: Request): boolean {
  const esperado = process.env.META_INGEST_TOKEN?.trim();
  if (!esperado) return false;
  const auth = req.headers.get("authorization");
  const recebido = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  // Hash de ambos iguala o tamanho dos buffers (exigência do timingSafeEqual)
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

type IngestBody = {
  eventName?: string;
  occurredAt?: string;
  sourcePostId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  subpersonaTag?: string;
  dorTag?: string;
  projetoTag?: string;
  email?: string;
  phone?: string;
  rawPayload?: unknown;
};

const str = (v: unknown, max = 100): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

export async function POST(req: Request) {
  if (!process.env.META_INGEST_TOKEN?.trim()) {
    return NextResponse.json(
      { error: "Ingest desativado (META_INGEST_TOKEN não configurado)" },
      { status: 503 }
    );
  }
  if (!tokenValido(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const eventName = str(body.eventName, 50);
  if (!eventName || !EVENT_NAMES.includes(eventName)) {
    return NextResponse.json(
      { error: `eventName obrigatório (${EVENT_NAMES.join(" | ")})` },
      { status: 422 }
    );
  }

  const occurredAt = body.occurredAt ? new Date(body.occurredAt) : new Date();
  if (isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "occurredAt inválido" }, { status: 422 });
  }

  // Match de lead por email (case-insensitive) ou telefone
  const email = str(body.email);
  const phone = str(body.phone, 30);
  let leadId: string | null = null;
  if (email || phone) {
    const lead = await prisma.lead.findFirst({
      where: {
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(phone ? [{ phone }] : []),
        ],
      },
      select: { id: true, firstEventId: true },
    });
    if (lead) {
      leadId = lead.id;
      // Primeiro evento do lead: grava origem de tracking (uma vez só)
      if (!lead.firstEventId) {
        const evento = await prisma.trackingEvent.create({
          data: {
            eventName,
            occurredAt,
            sourcePostId: str(body.sourcePostId, 50),
            utmSource: str(body.utmSource),
            utmMedium: str(body.utmMedium),
            utmCampaign: str(body.utmCampaign),
            utmContent: str(body.utmContent),
            subpersonaTag: str(body.subpersonaTag, 20),
            dorTag: str(body.dorTag, 20),
            projetoTag: str(body.projetoTag, 20),
            rawPayload: body.rawPayload ? JSON.stringify(body.rawPayload).slice(0, 10000) : null,
            leadId,
          },
        });
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            firstEventId: evento.id,
            sourceSubpersona: str(body.subpersonaTag, 20),
            sourceDor: str(body.dorTag, 20),
            sourceProjeto: str(body.projetoTag, 20),
          },
        });
        return NextResponse.json(
          { ok: true, id: evento.id, leadMatched: true, firstEvent: true },
          { status: 201 }
        );
      }
    }
  }

  const evento = await prisma.trackingEvent.create({
    data: {
      eventName,
      occurredAt,
      sourcePostId: str(body.sourcePostId, 50),
      utmSource: str(body.utmSource),
      utmMedium: str(body.utmMedium),
      utmCampaign: str(body.utmCampaign),
      utmContent: str(body.utmContent),
      subpersonaTag: str(body.subpersonaTag, 20),
      dorTag: str(body.dorTag, 20),
      projetoTag: str(body.projetoTag, 20),
      rawPayload: body.rawPayload ? JSON.stringify(body.rawPayload).slice(0, 10000) : null,
      leadId,
    },
  });

  return NextResponse.json(
    { ok: true, id: evento.id, leadMatched: !!leadId, firstEvent: false },
    { status: 201 }
  );
}
