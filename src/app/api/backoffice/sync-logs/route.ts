import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * GET /api/backoffice/sync-logs
 *
 * Lista os últimos BtgSyncLog (todas as integrações: BTG, Google Cal,
 * Outlook, Datacrazy mensagens e Datacrazy Atividades). Útil pra debugar
 * "por que sync X não está atualizando?" sem precisar acessar Postgres
 * diretamente.
 *
 * Query params:
 *   - tipo     (opcional) ex: "google-calendar-poll", "outlook-poll",
 *              "datacrazy-atividades-poll", "recompute-agregados-reuniao"
 *   - sucesso  (opcional) "true" | "false" pra filtrar
 *   - limit    (default 50, max 200)
 *
 * Requer sessão (admin ou support — read-only sem PII sensível).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Não autenticado" },
      { status: 401 },
    );
  }

  const tipo = req.nextUrl.searchParams.get("tipo");
  const sucessoParam = req.nextUrl.searchParams.get("sucesso");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") ?? 50),
    200,
  );

  const where: {
    tipo?: string;
    sucesso?: boolean;
  } = {};
  if (tipo) where.tipo = tipo;
  if (sucessoParam === "true") where.sucesso = true;
  else if (sucessoParam === "false") where.sucesso = false;

  const logs = await prisma.btgSyncLog.findMany({
    where,
    orderBy: { iniciado: "desc" },
    take: limit,
    select: {
      id: true,
      tipo: true,
      trigger: true,
      iniciado: true,
      finalizado: true,
      sucesso: true,
      contasProcessadas: true,
      contasComErro: true,
      resumo: true,
      erros: true,
    },
  });

  // Sumário por tipo — facilita ver "quem rodou recentemente"
  const sumarioPorTipo: Record<string, {
    total: number;
    sucessos: number;
    falhas: number;
    ultima: Date | null;
    ultimoResumo: string | null;
  }> = {};
  for (const log of logs) {
    const t = log.tipo;
    if (!sumarioPorTipo[t]) {
      sumarioPorTipo[t] = {
        total: 0,
        sucessos: 0,
        falhas: 0,
        ultima: null,
        ultimoResumo: null,
      };
    }
    const s = sumarioPorTipo[t];
    s.total++;
    if (log.sucesso === true) s.sucessos++;
    else if (log.sucesso === false) s.falhas++;
    const data = log.finalizado ?? log.iniciado;
    if (!s.ultima || data > s.ultima) {
      s.ultima = data;
      s.ultimoResumo = log.resumo;
    }
  }

  return NextResponse.json({
    sumario: sumarioPorTipo,
    logs,
  });
}
