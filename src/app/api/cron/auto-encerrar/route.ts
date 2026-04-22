import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { processarAutoEncerramento } from "@/lib/painel-do-dia/auto-encerrar";

export const dynamic = "force-dynamic";

/**
 * Cron: Auto-encerramento pós-reunião — a cada 15 min.
 *
 * Detecta reuniões que terminaram 30-120 min atrás e cria sugestões
 * de encerramento com cliente identificado.
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await processarAutoEncerramento(userId);
  });

  return NextResponse.json({ resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
