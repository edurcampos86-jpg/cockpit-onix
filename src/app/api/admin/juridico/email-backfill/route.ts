/**
 * POST /api/admin/juridico/email-backfill
 *
 * Backfill manual: roda a ingestão SEM o filtro newer_than. Pega todo
 * email histórico que casa com os filtros (remetentes Clicksign/DocuSign
 * + has:attachment).
 *
 * Body opcional:
 *  { limit: number }    default 200, max 500
 *  { query: string }    sobrescreve a query Gmail padrão (avançado)
 *  { userId: string }   roda pra um User específico; default = userId do auth
 *
 * Auth: admin.
 *
 * Idempotência: emails já em IngestaoEmail são pulados; PDFs já no cofre
 * (mesmo hash) são pulados.
 */
import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { rodarComLogDeErro } from "@/lib/juridico/email-ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { limit?: number; query?: string; userId?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const limit = Math.min(Math.max(body.limit ?? 200, 1), 500);
  const targetUserId = body.userId || ctx.userId;

  const result = await rodarComLogDeErro(targetUserId, {
    backfill: true,
    limit,
    query: body.query,
  });

  return NextResponse.json({ ok: true, userId: targetUserId, ...result });
}
