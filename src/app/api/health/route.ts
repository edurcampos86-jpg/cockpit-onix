import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Health check público. Usado por:
//   - .github/workflows/post-deploy-smoke.yml (após deploy + cron 15min)
//   - eventual uptime monitor externo (StatusCake / Uptime Kuma)
//
// SEM autenticação: é endpoint diagnóstico e não vaza dados.
// Retorna 200 com { status:'ok', db:'up' } quando tudo OK; retorna 503
// com { status:'degraded', db:'down', dbError } quando o ping ao Postgres
// falha — assim o smoke test detecta DB down separado de app down.

export const dynamic = "force-dynamic";

export async function GET() {
  const timestamp = new Date().toISOString();
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        db: "up",
        dbLatencyMs: Date.now() - start,
        timestamp,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        status: "degraded",
        db: "down",
        dbError: message,
        timestamp,
      },
      { status: 503 },
    );
  }
}
