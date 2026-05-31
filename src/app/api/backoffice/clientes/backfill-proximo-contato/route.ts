/**
 * POST /api/backoffice/clientes/backfill-proximo-contato
 *
 * Semeia `proximoContatoAt` (FIX C) pra todo cliente que ainda não tem,
 * calculando a próxima data pela classificação A/B/C (mesma régua de
 * `proximoContatoPor`), ancorada em `ultimoContatoAt` quando existe.
 *
 * Idempotente: só toca clientes com `proximoContatoAt IS NULL`. Pode rodar
 * quantas vezes quiser — clientes já semeados nunca mudam.
 *
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { backfillProximoContato } from "@/lib/cadencia";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { atualizados } = await backfillProximoContato();
  return NextResponse.json({ ok: true, atualizados });
}
