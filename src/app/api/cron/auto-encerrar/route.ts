import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { processarAutoEncerramento } from "@/lib/painel-do-dia/auto-encerrar";

export const dynamic = "force-dynamic";

/**
 * Cron: auto-encerramento pós-reunião.
 *
 * Detecta reuniões que terminaram 30-120 min atrás e cria sugestões de
 * encerramento, com o cliente identificado quando o título permite.
 *
 * NÃO está em nenhum schedule. Disparo manual pelo workflow_dispatch de
 * .github/workflows/cron.yml, informando o path em "paths".
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await processarAutoEncerramento(userId);
  });

  return NextResponse.json({ ok: true, resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
