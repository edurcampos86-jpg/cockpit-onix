export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { RITUAIS, gerarOcorrencias, getFreqLabel, getDiaSemanaLabel } from "@/lib/rituais-data";
import { RituaisClient } from "./rituais-client";

export const metadata = {
  title: "Rituais e Calendario — Onix Corretora",
};

export type ExecucaoData = {
  id: string;
  ritualId: string;
  data: string;
  realizado: boolean;
  notas: string | null;
};

export type OcorrenciaCalendario = {
  ritualId: string;
  titulo: string;
  cor: string;
  frequencia: string;
  data: string; // ISO
  dia: number;
  realizado: boolean;
  execucaoId: string | null;
  notas: string | null;
};

export type RitualResumo = {
  id: string;
  titulo: string;
  descricao: string;
  frequencia: string;
  frequenciaLabel: string;
  diaSemanaLabel: string | null;
  duracao: string;
  responsavel: string;
  participantes: string[];
  cor: string;
  totalMes: number;
  realizadosMes: number;
  streak: number;
};

export default async function RituaisPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ano?: string }>;
}) {
  const { mes: mesParam, ano: anoParam } = await searchParams;

  const agora = new Date();
  const mes = mesParam != null ? parseInt(mesParam) : agora.getMonth();
  const ano = anoParam != null ? parseInt(anoParam) : agora.getFullYear();

  // Buscar execuções do mês
  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0, 23, 59, 59);

  const execucoes = await prisma.ritualExecucao.findMany({
    where: { data: { gte: inicio, lte: fim } },
    orderBy: { data: "asc" },
  });

  const execMap = new Map<string, typeof execucoes[0]>();
  for (const e of execucoes) {
    const key = `${e.ritualId}:${e.data.toISOString().split("T")[0]}`;
    execMap.set(key, e);
  }

  // Buscar execuções dos últimos 90 dias para calcular streaks
  const inicio90 = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
  const execucoesStreak = await prisma.ritualExecucao.findMany({
    where: { data: { gte: inicio90, lte: agora }, realizado: true },
    orderBy: { data: "desc" },
  });

  // Gerar ocorrências e cruzar com execuções
  const ocorrencias: OcorrenciaCalendario[] = [];
  const rituaisResumo: RitualResumo[] = [];

  for (const ritual of RITUAIS) {
    const datas = gerarOcorrencias(ritual, mes, ano);

    let totalMes = 0;
    let realizadosMes = 0;

    // Para o calendário, só incluir semanais e menos frequentes (não diários)
    for (const d of datas) {
      const key = `${ritual.id}:${d.toISOString().split("T")[0]}`;
      const exec = execMap.get(key);
      totalMes++;
      if (exec?.realizado) realizadosMes++;

      // Incluir todas frequências no calendário exceto diário (poluiria demais)
      if (ritual.frequencia !== "diario") {
        ocorrencias.push({
          ritualId: ritual.id,
          titulo: ritual.titulo,
          cor: ritual.cor,
          frequencia: ritual.frequencia,
          data: d.toISOString(),
          dia: d.getDate(),
          realizado: exec?.realizado ?? false,
          execucaoId: exec?.id ?? null,
          notas: exec?.notas ?? null,
        });
      }
    }

    // Para diário, contar total de dias úteis
    if (ritual.frequencia === "diario") {
      // Já calculado acima via datas
    }

    // Calcular streak
    let streak = 0;
    if (ritual.frequencia === "semanal") {
      // Streak = semanas consecutivas realizadas
      const execsRitual = execucoesStreak
        .filter((e) => e.ritualId === ritual.id)
        .sort((a, b) => b.data.getTime() - a.data.getTime());

      // Agrupar por semana
      const semanasSet = new Set<string>();
      for (const e of execsRitual) {
        const weekStart = new Date(e.data);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        semanasSet.add(weekStart.toISOString().split("T")[0]);
      }

      const semanas = Array.from(semanasSet).sort().reverse();
      for (let i = 0; i < semanas.length; i++) {
        if (i === 0) {
          streak = 1;
        } else {
          const prev = new Date(semanas[i - 1]);
          const curr = new Date(semanas[i]);
          const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays <= 8) streak++;
          else break;
        }
      }
    } else if (ritual.frequencia === "diario") {
      // Streak = dias úteis consecutivos
      const execsRitual = execucoesStreak
        .filter((e) => e.ritualId === ritual.id)
        .sort((a, b) => b.data.getTime() - a.data.getTime());

      for (let i = 0; i < execsRitual.length; i++) {
        if (i === 0) {
          streak = 1;
        } else {
          const prev = execsRitual[i - 1].data;
          const curr = execsRitual[i].data;
          const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
          // Permitir gap de fim de semana (até 3 dias)
          if (diffDays <= 3) streak++;
          else break;
        }
      }
    } else {
      // Para mensal+, contar ocorrências realizadas seguidas
      const execsRitual = execucoesStreak
        .filter((e) => e.ritualId === ritual.id)
        .sort((a, b) => b.data.getTime() - a.data.getTime());
      streak = execsRitual.length; // Simplificado para menos frequentes
    }

    rituaisResumo.push({
      id: ritual.id,
      titulo: ritual.titulo,
      descricao: ritual.descricao,
      frequencia: ritual.frequencia,
      frequenciaLabel: getFreqLabel(ritual.frequencia),
      diaSemanaLabel: ritual.diaSemana != null ? getDiaSemanaLabel(ritual.diaSemana) : null,
      duracao: ritual.duracao,
      responsavel: ritual.responsavel,
      participantes: ritual.participantes,
      cor: ritual.cor,
      totalMes: totalMes,
      realizadosMes: realizadosMes,
      streak,
    });
  }

  // Contadores gerais
  const totalRituais = rituaisResumo.length;
  const totalOcorrenciasMes = rituaisResumo.reduce((sum, r) => sum + r.totalMes, 0);
  const totalRealizadosMes = rituaisResumo.reduce((sum, r) => sum + r.realizadosMes, 0);
  const maiorStreak = Math.max(...rituaisResumo.map((r) => r.streak), 0);

  return (
    <RituaisClient
      rituais={rituaisResumo}
      ocorrencias={ocorrencias}
      mes={mes}
      ano={ano}
      contadores={{ totalRituais, totalOcorrenciasMes, totalRealizadosMes, maiorStreak }}
    />
  );
}
