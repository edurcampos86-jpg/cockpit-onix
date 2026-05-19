/**
 * POST /api/admin/backups/manual
 *
 * Dispara backup imediato (sob demanda). Mesmo path do cron, mas sem
 * CRON_SECRET — exige admin logado.
 */
import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Re-chama o endpoint do cron passando o CRON_SECRET internamente.
  // Mais simples que duplicar a lógica de backup.
  const url = new URL("/api/cron/backup-daily", req.url);
  const headers: Record<string, string> = {};
  const secret = process.env.CRON_SECRET;
  if (secret) headers["authorization"] = `Bearer ${secret}`;

  const res = await fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return NextResponse.json(json, { status: res.status });
}
