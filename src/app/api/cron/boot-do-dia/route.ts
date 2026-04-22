import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { aplicarBoot } from "@/lib/painel-do-dia/boot-do-dia";

export const dynamic = "force-dynamic";

/**
 * Cron: Boot do Dia — sugere 3 Prioridades do Dia por heurística.
 *
 * Disparado diariamente às 07:30 America/Bahia via Railway cron
 * (configurado em `railway.toml`). Em dev, pode ser chamado
 * manualmente via `POST /api/cron/boot-do-dia`.
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await aplicarBoot(userId);
  });

  return NextResponse.json({ resultado });
}

// Permite GET para facilitar disparo manual e health checks
export async function GET(request: Request) {
  return POST(request);
}
