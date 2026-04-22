import { NextResponse } from "next/server";
import { guardCron, comTodosUsuarios } from "@/lib/painel-do-dia/cron-guard";
import { processarTriagem } from "@/lib/painel-do-dia/triar-emails";

export const dynamic = "force-dynamic";

/**
 * Cron: Triagem AI de e-mails — a cada 15 min.
 *
 * Classifica novos e-mails no cache ms-mail via Claude e grava
 * em PainelEmailAI para alimentar o card "E-mails que pedem ação"
 * com badge de quadrante sugerido e botão "Criar ação".
 */
export async function POST(request: Request) {
  const forbidden = guardCron(request);
  if (forbidden) return forbidden;

  const resultado = await comTodosUsuarios(async (userId) => {
    return await processarTriagem(userId);
  });

  return NextResponse.json({ resultado });
}

export async function GET(request: Request) {
  return POST(request);
}
