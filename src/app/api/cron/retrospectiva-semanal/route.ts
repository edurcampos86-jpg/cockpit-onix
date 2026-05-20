import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { gerarRetrospectiva } from "@/lib/painel-do-dia/retrospectiva";

/**
 * GET /api/cron/retrospectiva-semanal
 *
 * Dispara todo domingo 23:00 UTC (20:00 Bahia) — agendado em
 * .github/workflows/cron.yml (`0 23 * * 0`).
 *
 * Pra cada usuario com UserGoogleAuth (proxy de "ativo no Cockpit"),
 * chama gerarRetrospectiva() — coleta metricas da semana terminada
 * domingo passado + insight do Claude, salva em PainelRetrospectiva.
 *
 * Idempotente: o unique [userId, semanaInicio] garante que rodar 2x
 * no mesmo dia nao cria duplicata (retorna `ja_existia: true`).
 *
 * Best-effort por usuario: se um falhar (Claude rate limit, BD glitch),
 * outros continuam.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300; // ate 5min — Claude por usuario + IO

export async function GET(req: NextRequest) {
  const guardErr = guardCron(req);
  if (guardErr) return guardErr;

  const usuarios = await prisma.userGoogleAuth.findMany({
    select: { userId: true, googleEmail: true },
  });

  if (usuarios.length === 0) {
    return NextResponse.json({
      ok: true,
      mensagem: "Nenhum usuario com Google conectado.",
      processados: 0,
    });
  }

  const resultados: Array<{
    userId: string;
    email: string;
    status: "criada" | "ja_existia" | "erro";
    erro?: string;
    retrospectivaId?: string;
  }> = [];

  for (const u of usuarios) {
    try {
      const { id, ja_existia } = await gerarRetrospectiva(u.userId);
      resultados.push({
        userId: u.userId,
        email: u.googleEmail,
        status: ja_existia ? "ja_existia" : "criada",
        retrospectivaId: id,
      });
    } catch (err) {
      resultados.push({
        userId: u.userId,
        email: u.googleEmail,
        status: "erro",
        erro: err instanceof Error ? err.message.slice(0, 200) : "desconhecido",
      });
    }
  }

  const novas = resultados.filter((r) => r.status === "criada").length;
  const erros = resultados.filter((r) => r.status === "erro").length;

  return NextResponse.json({
    ok: erros === 0,
    processados: resultados.length,
    novas,
    erros,
    resultados,
  });
}
