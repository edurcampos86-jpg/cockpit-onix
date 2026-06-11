/**
 * GET /api/cron/btg-freshness
 * Heartbeat de freshness dos dados BTG (seg-sex via cron.yml).
 * Auth: Bearer CRON_SECRET (guardCron). Delega a lógica in-process.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { verificarFreshnessBtg } from "@/lib/backoffice/btg-freshness";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;
  const resultado = await verificarFreshnessBtg();
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
