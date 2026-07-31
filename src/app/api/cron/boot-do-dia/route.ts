import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { aplicarBoot } from "@/lib/painel-do-dia/boot-do-dia";

export const dynamic = "force-dynamic";

/**
 * Cron: Boot do Dia — sugere as 3 Prioridades do Dia por heurística.
 *
 * Preenche apenas slots vazios do dia corrente; nunca sobrescreve
 * prioridade digitada pelo usuário.
 *
 * NÃO está em nenhum schedule. Disparo manual pelo workflow_dispatch de
 * .github/workflows/cron.yml, informando o path em "paths". Quando for
 * agendada, o horário pretendido é 07:30 America/Bahia (10:30 UTC), antes
 * do início do dia de trabalho.
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await aplicarBoot(userId);
  });

  return NextResponse.json({ ok: true, resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
