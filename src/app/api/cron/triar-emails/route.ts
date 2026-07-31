import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { processarTriagem } from "@/lib/painel-do-dia/triar-emails";

export const dynamic = "force-dynamic";

/**
 * Cron: triagem AI de e-mails.
 *
 * Classifica e-mails novos do cache ms-mail via Claude e grava em
 * PainelEmailAI, alimentando o card "E-mails que pedem ação" com o
 * quadrante sugerido e o botão "Criar ação".
 *
 * CONSOME API Claude: até LIMITE_POR_RODADA (20) e-mails por usuário por
 * execução — ver src/lib/painel-do-dia/triar-emails.ts.
 *
 * NÃO está em nenhum schedule. Disparo manual pelo workflow_dispatch de
 * .github/workflows/cron.yml, informando o path em "paths".
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await processarTriagem(userId);
  });

  return NextResponse.json({ ok: true, resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
