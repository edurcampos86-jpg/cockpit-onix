export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { PAT_PROFILES } from "@/lib/pat-profiles";
import {
  TRILHAS,
  getFaseAtual,
  getProgressoGeral,
  getProgressoFase,
  getStatusFase,
  getProximoMarco,
  mesParaLabel,
} from "@/lib/trilha-data";
import { TrilhaClient } from "./trilha-client";

export async function generateMetadata({ params }: { params: Promise<{ pessoa: string }> }) {
  const { pessoa } = await params;
  const nome = decodeURIComponent(pessoa);
  return { title: `${nome.split(" ")[0]} — Trilha de Desenvolvimento` };
}

export default async function TrilhaPessoaPage({
  params,
}: {
  params: Promise<{ pessoa: string }>;
}) {
  const { pessoa } = await params;
  const nome = decodeURIComponent(pessoa);

  const trilha = TRILHAS[nome];
  const pat = PAT_PROFILES[nome];
  if (!trilha) notFound();

  // Buscar histórico de métricas (últimas 12 semanas)
  const metricas = await prisma.metrica.findMany({
    where: { vendedor: nome },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      periodo: true,
      score: true,
      conversasAnalisadas: true,
      conversasSemResposta: true,
      reunioesAgendadas: true,
      leadsPerdidos: true,
      createdAt: true,
    },
  });

  // Computar dados da trilha
  const faseAtual = getFaseAtual(trilha);
  const progressoGeral = getProgressoGeral(trilha);
  const proximo = getProximoMarco(trilha);

  const fasesComStatus = trilha.fases.map((f) => ({
    ...f,
    status: getStatusFase(f),
    progresso: getProgressoFase(f),
    labelInicio: mesParaLabel(f.mesInicio),
    labelFim: mesParaLabel(f.mesFim),
  }));

  // Histórico para o gráfico
  const historico = metricas.map((m) => {
    const taxaResposta =
      m.conversasAnalisadas > 0
        ? Math.round(((m.conversasAnalisadas - m.conversasSemResposta) / m.conversasAnalisadas) * 100)
        : 0;
    return {
      periodo: m.periodo,
      score: m.score,
      taxaResposta,
      reunioes: m.reunioesAgendadas,
      data: m.createdAt.toISOString(),
    };
  });

  // Score atual e meta
  const scoreAtual = metricas.length > 0 ? metricas[metricas.length - 1].score : 0;

  return (
    <TrilhaClient
      vendedor={nome}
      pat={
        pat
          ? {
              numero: pat.pat,
              titulo: pat.titulo,
              emoji: pat.emoji,
              corPrimaria: pat.corPrimaria,
              corBg: pat.corBg,
              palavrasChave: pat.palavrasChave,
              resumo: pat.resumo,
            }
          : null
      }
      cargoAtual={trilha.cargoAtual}
      cargoAlvo={trilha.cargoAlvo}
      fases={fasesComStatus}
      faseAtualNumero={faseAtual?.numero ?? null}
      progressoGeral={progressoGeral}
      proximoMarco={proximo}
      historico={historico}
      scoreAtual={scoreAtual}
      scoreMeta={faseAtual?.kpisMeta.score ?? 0}
    />
  );
}
