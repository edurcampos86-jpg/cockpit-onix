export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ReuniaoClient } from "./reuniao-client";
import { PAT_PROFILES } from "@/lib/pat-profiles";

export const metadata = {
  title: "Reuniao Semanal — Formato C",
};

type VendedorResumo = {
  id: string;
  vendedor: string;
  periodo: string;
  conversasAnalisadas: number;
  secao1: string;
  secao2: string;
  secao3: string;
  secao5: string;
  scriptSemana: string | null;
  termometro: string | null;
  retomada: string | null;
  acoes: { id: string; titulo: string; concluida: boolean }[];
  metricas: {
    score: number;
    conversasAnalisadas: number;
    conversasSemResposta: number;
    reunioesAgendadas: number;
    leadsPerdidos: number;
  } | null;
  pat: {
    numero: number;
    titulo: string;
    emoji: string;
    corPrimaria: string;
    corBg: string;
    palavrasChave: string[];
    tomRelatorio: string;
  } | null;
};

export default async function ReuniaoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo: periodoParam } = await searchParams;

  // Buscar períodos disponíveis (coletivos gerados)
  const periodosColetivos = await prisma.relatorioColetivo.findMany({
    orderBy: { periodoInicio: "desc" },
    select: { id: true, periodo: true, periodoInicio: true },
    take: 20,
  });

  // Se não há relatórios coletivos, buscar períodos dos individuais
  const periodosIndividuais = await prisma.relatorio.findMany({
    orderBy: { periodoInicio: "desc" },
    select: { periodo: true, periodoInicio: true },
    distinct: ["periodo"],
    take: 20,
  });

  const periodos = periodosColetivos.length > 0
    ? periodosColetivos.map((p) => ({ label: p.periodo, value: p.periodo }))
    : periodosIndividuais.map((p) => ({ label: p.periodo, value: p.periodo }));

  // Período selecionado
  const periodoAtual = periodoParam || periodos[0]?.value || null;

  if (!periodoAtual) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-semibold mb-2">Nenhum relatorio disponivel</h2>
        <p className="text-sm text-muted-foreground">
          Execute o pipeline semanal para gerar o primeiro relatorio.
        </p>
      </div>
    );
  }

  // Buscar relatório coletivo do período
  const coletivo = await prisma.relatorioColetivo.findFirst({
    where: { periodo: periodoAtual },
    orderBy: { createdAt: "desc" },
  });

  // Buscar relatórios individuais do período
  const individuais = await prisma.relatorio.findMany({
    where: { periodo: periodoAtual },
    include: {
      acoes: { orderBy: { numero: "asc" }, select: { id: true, titulo: true, concluida: true } },
      metricas: {
        select: {
          score: true,
          conversasAnalisadas: true,
          conversasSemResposta: true,
          reunioesAgendadas: true,
          leadsPerdidos: true,
        },
      },
    },
    orderBy: { vendedor: "asc" },
  });

  // Montar resumo individual com PAT
  const vendedores: VendedorResumo[] = individuais.map((r) => {
    const pat = PAT_PROFILES[r.vendedor];
    return {
      id: r.id,
      vendedor: r.vendedor,
      periodo: r.periodo,
      conversasAnalisadas: r.conversasAnalisadas,
      secao1: r.secao1,
      secao2: r.secao2,
      secao3: r.secao3,
      secao5: r.secao5,
      scriptSemana: r.scriptSemana,
      termometro: r.termometro,
      retomada: r.retomada,
      acoes: r.acoes,
      metricas: r.metricas,
      pat: pat
        ? {
            numero: pat.pat,
            titulo: pat.titulo,
            emoji: pat.emoji,
            corPrimaria: pat.corPrimaria,
            corBg: pat.corBg,
            palavrasChave: pat.palavrasChave,
            tomRelatorio: pat.tomRelatorio,
          }
        : null,
    };
  });

  // Dados do coletivo serializáveis
  const coletivoData = coletivo
    ? {
        id: coletivo.id,
        periodo: coletivo.periodo,
        vendedoresAnalisados: coletivo.vendedoresAnalisados,
        metricasConsolidadas: coletivo.metricasConsolidadas,
        scoreIndividual: coletivo.scoreIndividual,
        termometroTime: coletivo.termometroTime,
        objecoesRecorrentes: coletivo.objecoesRecorrentes,
        padroesPositivos: coletivo.padroesPositivos,
        padroesRisco: coletivo.padroesRisco,
        scriptColetivo: coletivo.scriptColetivo,
        planoColetivo: coletivo.planoColetivo,
        cumprimentoAnterior: coletivo.cumprimentoAnterior,
      }
    : null;

  return (
    <ReuniaoClient
      periodoAtual={periodoAtual}
      periodos={periodos}
      coletivo={coletivoData}
      vendedores={vendedores}
    />
  );
}
