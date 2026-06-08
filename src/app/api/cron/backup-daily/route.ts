/**
 * GET /api/cron/backup-daily
 * Cron diário (Railway). Auth: Bearer CRON_SECRET (guardCron). Delega a lógica.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { executarBackupBanco } from "@/lib/backup/run-backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;
  const { status, body } = await executarBackupBanco();
  return NextResponse.json(body, { status });
}
