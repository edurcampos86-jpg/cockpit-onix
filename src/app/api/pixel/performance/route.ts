/**
 * GET /api/pixel/performance
 * Matriz de CAC (subpersona × dor × projeto, janela 30d).
 * Lê o cache do Config DB (recalculado pelo cron meta-sync); se
 * ausente ou velho (>24h), calcula on-demand sem gravar.
 * Auth: sessão (proxy padrão).
 */
import { NextResponse } from "next/server";
import { getCacMatrix } from "@/lib/pixel/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCacMatrix());
}
