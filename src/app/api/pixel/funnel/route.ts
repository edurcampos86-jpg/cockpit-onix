/**
 * GET /api/pixel/funnel?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Funil de conversão (snapshots + eventos). Default: últimos 7 dias.
 * Auth: sessão (proxy padrão).
 */
import { NextResponse } from "next/server";
import { getFunnel } from "@/lib/pixel/metrics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const to = toParam ? new Date(`${toParam}T23:59:59.999Z`) : new Date();
  const from = fromParam
    ? new Date(`${fromParam}T00:00:00.000Z`)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Janela inválida" }, { status: 422 });
  }

  return NextResponse.json(await getFunnel(from, to));
}
