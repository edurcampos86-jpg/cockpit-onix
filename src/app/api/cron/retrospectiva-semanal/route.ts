import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { gerarRetrospectiva } from "@/lib/painel-do-dia/retrospectiva";

export const dynamic = "force-dynamic";

/**
 * Cron: Retrospectiva Semanal — domingo 20:00 America/Bahia.
 *
 * Gera snapshot da semana anterior com métricas Eisenhower, saúde Supernova
 * e insight textual pelo Claude. Card fixo no painel na segunda-feira.
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await gerarRetrospectiva(userId);
  });

  return NextResponse.json({ resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
