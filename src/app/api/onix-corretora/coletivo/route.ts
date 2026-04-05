import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gerarRelatorioColetivo, parseBlocosColetivo } from "@/lib/claude-coletivo";
import { parseBlocos } from "@/lib/claude-analisar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET — lista relatorios coletivos
export async function GET() {
  const relatorios = await prisma.relatorioColetivo.findMany({
    orderBy: { periodoInicio: "desc" },
  });

  return NextResponse.json({ ok: true, relatorios });
}

// POST — gera relatorio coletivo a partir dos individuais da semana
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { periodoInicio, periodoFim, periodo } = body as {
    periodoInicio: string;
    periodoFim: string;
    periodo: string;
  };

  const inicio = new Date(periodoInicio);
  const fim = new Date(periodoFim);

  // 1. Buscar relatorios individuais do periodo (apenas Thiago e Rose)
  const vendedoresAlvo = ["Thiago Vergal", "Rose Oliveira"];

  const relatorios = await prisma.relatorio.findMany({
    where: {
      vendedor: { in: vendedoresAlvo },
      periodoInicio: { gte: inicio },
      periodoFim: { lte: new Date(fim.getTime() + 24 * 60 * 60 * 1000) },
    },
    include: { metricas: true, acoes: true },
    orderBy: { vendedor: "asc" },
  });

  if (relatorios.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Nenhum relatorio individual encontrado no periodo para Thiago/Rose. Gere os relatorios individuais primeiro." },
      { status: 400 }
    );
  }

  // 2. Buscar relatorios anteriores (para comparativo)
  const relatoriosAnteriores = await prisma.relatorio.findMany({
    where: {
      vendedor: { in: vendedoresAlvo },
      periodoFim: { lt: inicio },
    },
    include: { metricas: true },
    orderBy: { periodoInicio: "desc" },
    take: vendedoresAlvo.length, // 1 per vendedor
  });

  // 3. Calcular cumprimento de acoes da semana anterior
  const cumprimentoAcoes: Array<{ vendedor: string; total: number; concluidas: number }> = [];

  for (const v of vendedoresAlvo) {
    const relAnterior = relatoriosAnteriores.find(r => r.vendedor === v);
    if (relAnterior) {
      const acoes = await prisma.acao.findMany({
        where: { relatorioId: relAnterior.id },
      });
      cumprimentoAcoes.push({
        vendedor: v,
        total: acoes.length,
        concluidas: acoes.filter(a => a.concluida).length,
      });
    }
  }

  // 4. Chamar Claude para gerar analise coletiva
  const textoAnalise = await gerarRelatorioColetivo({
    periodo,
    relatorios: relatorios.map(r => ({
      vendedor: r.vendedor,
      secao1: r.secao1,
      secao2: r.secao2,
      secao3: r.secao3,
      secao4: r.secao4,
      secao5: r.secao5,
      termometro: (r as Record<string, unknown>).termometro as string | null,
      scriptSemana: (r as Record<string, unknown>).scriptSemana as string | null,
      metricas: r.metricas
        ? {
            conversasAnalisadas: r.metricas.conversasAnalisadas,
            conversasSemResposta: r.metricas.conversasSemResposta,
            reunioesAgendadas: r.metricas.reunioesAgendadas,
            leadsPerdidos: r.metricas.leadsPerdidos,
            score: r.metricas.score,
          }
        : null,
    })),
    relatoriosAnteriores: relatoriosAnteriores.map(r => ({
      vendedor: r.vendedor,
      metricas: r.metricas
        ? {
            conversasAnalisadas: r.metricas.conversasAnalisadas,
            conversasSemResposta: r.metricas.conversasSemResposta,
            reunioesAgendadas: r.metricas.reunioesAgendadas,
            leadsPerdidos: r.metricas.leadsPerdidos,
            score: r.metricas.score,
          }
        : null,
    })),
    cumprimentoAcoes,
  });

  // 5. Parse blocos
  const blocos = parseBlocosColetivo(textoAnalise);

  // 6. Salvar no banco
  const relColetivo = await prisma.relatorioColetivo.create({
    data: {
      periodo,
      periodoInicio: inicio,
      periodoFim: fim,
      dataExecucao: new Date(),
      vendedoresAnalisados: vendedoresAlvo.join(","),
      metricasConsolidadas: blocos["METRICAS_CONSOLIDADAS"] ?? "",
      scoreIndividual: blocos["SCORE_INDIVIDUAL"] ?? "",
      termometroTime: blocos["TERMOMETRO_TIME"] ?? "",
      objecoesRecorrentes: blocos["OBJECOES_RECORRENTES"] ?? "",
      padroesPositivos: blocos["PADROES_POSITIVOS"] ?? "",
      padroesRisco: blocos["PADROES_RISCO"] ?? "",
      scriptColetivo: blocos["SCRIPT_COLETIVO"] ?? "",
      planoColetivo: blocos["PLANO_COLETIVO"] ?? "",
      cumprimentoAnterior: cumprimentoAcoes.length > 0
        ? JSON.stringify(cumprimentoAcoes)
        : null,
    },
  });

  return NextResponse.json({
    ok: true,
    id: relColetivo.id,
    periodo,
    vendedoresAnalisados: vendedoresAlvo,
    blocosGerados: Object.keys(blocos),
  });
}
