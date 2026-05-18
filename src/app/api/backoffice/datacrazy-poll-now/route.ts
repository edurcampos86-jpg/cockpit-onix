import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getConfig } from "@/lib/config-db";
import { runDatacrazyPoll } from "@/lib/datacrazy-poll-runner";

/**
 * GET /api/backoffice/datacrazy-poll-now
 *
 * Workaround manual pro polling de mensagens Datacrazy WhatsApp.
 * Mesma lógica do /api/cron/datacrazy-poll, mas autenticado por
 * sessão admin em vez de CRON_SECRET. Útil quando os crons do
 * Railway estão fora.
 *
 * Aceita GET (em vez de POST) pra rodar abrindo URL no browser.
 *
 * Query params:
 *   - cutoffMinutes  janela de "atividade recente" (default 30,
 *                    max 1440 = 24h). Aumentar pra cobrir buraco
 *                    de quando o cron ficou parado por horas.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Apenas admin pode disparar polling manual" },
      { status: 403 },
    );
  }

  const token = await getConfig("DATACRAZY_TOKEN");
  if (!token) {
    return NextResponse.json(
      { error: "DATACRAZY_TOKEN não configurado" },
      { status: 400 },
    );
  }

  const cutoffMinutes = Math.min(
    Number(req.nextUrl.searchParams.get("cutoffMinutes") ?? 30),
    1440,
  );

  const log = await prisma.btgSyncLog.create({
    data: {
      tipo: "datacrazy-poll",
      trigger: "manual",
      userId: session.userId,
      resumo: `cutoffMinutes=${cutoffMinutes}`,
    },
  });

  const result = await runDatacrazyPoll({ token, cutoffMinutes });

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: result.erros.length === 0,
      contasProcessadas: result.conversasComMudanca,
      contasComErro: result.erros.length,
      resumo: `[manual cutoff=${cutoffMinutes}min] ${result.conversasVistas} conversas vistas · ${result.conversasComMudanca} c/ delta · ${result.mensagensNovas} msgs novas`,
      erros: result.erros.length > 0 ? result.erros : undefined,
    },
  });

  return NextResponse.json({
    ok: result.erros.length === 0,
    cutoffMinutes,
    ...result,
    erros: result.erros.slice(0, 20),
  });
}
