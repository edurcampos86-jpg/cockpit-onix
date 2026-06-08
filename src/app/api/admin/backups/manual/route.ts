/**
 * POST /api/admin/backups/manual
 * Dispara backup imediato. Exige admin logado. Chama a lógica direto
 * (sem self-fetch HTTP — o round-trip via URL pública quebrava com TLS).
 */
import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { executarBackupBanco } from "@/lib/backup/run-backup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { status, body } = await executarBackupBanco();
  return NextResponse.json(body, { status });
}
