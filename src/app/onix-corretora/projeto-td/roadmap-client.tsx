"use client";

import { useState } from "react";
import { ComoFunciona } from "@/components/layout/como-funciona";
import {
  MapPin,
  CheckCircle2,
  Clock,
  Circle,
  ChevronDown,
  ChevronUp,
  Flag,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type StatusFase = "nao_iniciada" | "em_andamento" | "concluida" | "atrasada";

type FaseData = {
  id: string;
  titulo: string;
  descricao: string;
  mesInicio: number;
  mesFim: number;
  ano: number;
  entregas: string[];
  cor: string;
  status: StatusFase;
  labelInicio: string;
  labelFim: string;
};

type AnoData = {
  numero: number;
  titulo: string;
  subtitulo: string;
  cor: string;
  fases: FaseData[];
};

type Props = {
  anos: AnoData[];
  mesAtual: number;
  anoAtual: number;
  progressoProjeto: number;
  contadores: { total: number; concluidas: number; emAndamento: number };
};

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  StatusFase,
  { icon: React.ReactNode; emoji: string; label: string; textColor: string; bgColor: string }
> = {
  concluida: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    emoji: "✅",
    label: "Concluida",
    textColor: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/20",
  },
  em_andamento: {
    icon: <Clock className="h-4 w-4" />,
    emoji: "🔄",
    label: "Em andamento",
    textColor: "text-primary",
    bgColor: "bg-primary/5",
  },
  nao_iniciada: {
    icon: <Circle className="h-4 w-4" />,
    emoji: "⬜",
    label: "Nao iniciada",
    textColor: "text-muted-foreground",
    bgColor: "",
  },
  atrasada: {
    icon: <Flag className="h-4 w-4" />,
    emoji: "⚠️",
    label: "Atrasada",
    textColor: "text-red-600",
    bgColor: "bg-red-50 dark:bg-red-950/20",
  },
};

// ── Timeline Bar ─────────────────────────────────────────────────────────────

function TimelineBar({ mesAtual, anos }: { mesAtual: number; anos: AnoData[] }) {
  const totalMeses = 60;
  const posicaoAtual = Math.min(100, ((mesAtual - 0.5) / totalMeses) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-5 mb-6 overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Barra principal */}
        <div className="relative h-10 rounded-full bg-sidebar-accent overflow-visible">
          {/* Blocos por ano */}
          {anos.map((ano) => {
            const inicio = ((ano.fases[0].mesInicio - 1) / totalMeses) * 100;
            const fim = (ano.fases[ano.fases.length - 1].mesFim / totalMeses) * 100;
            const width = fim - inicio;
            return (
              <div
                key={ano.numero}
                className="absolute top-0 h-full rounded-full opacity-20"
                style={{
                  left: `${inicio}%`,
                  width: `${width}%`,
                  backgroundColor: ano.cor,
                }}
              />
            );
          })}

          {/* Progresso preenchido */}
          <div
            className="absolute top-0 h-full rounded-full bg-primary/30"
            style={{ width: `${posicaoAtual}%` }}
          />

          {/* Indicador "VOCE ESTA AQUI" */}
          <div
            className="absolute top-1/2 -translate-y-1/2 z-10"
            style={{ left: `${posicaoAtual}%` }}
          >
            <div className="relative flex flex-col items-center">
              <div className="absolute -top-8 whitespace-nowrap px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                <MapPin className="h-3 w-3 inline mr-0.5" />
                VOCE ESTA AQUI
              </div>
              <div className="w-3 h-10 rounded-full bg-primary border-2 border-background shadow-lg" />
            </div>
          </div>
        </div>

        {/* Labels dos anos */}
        <div className="relative mt-2 h-6">
          {anos.map((ano) => {
            const inicio = ((ano.fases[0].mesInicio - 1) / totalMeses) * 100;
            const fim = (ano.fases[ano.fases.length - 1].mesFim / totalMeses) * 100;
            const center = (inicio + fim) / 2;
            return (
              <div
                key={ano.numero}
                className="absolute text-center"
                style={{ left: `${center}%`, transform: "translateX(-50%)" }}
              >
                <span className="text-[10px] font-bold" style={{ color: ano.cor }}>
                  Ano {ano.numero}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Fase Card ────────────────────────────────────────────────────────────────

function FaseCard({ fase, mesAtual }: { fase: FaseData; mesAtual: number }) {
  const [expanded, setExpanded] = useState(fase.status === "em_andamento");
  const config = STATUS_CONFIG[fase.status];
  const isCurrent = mesAtual >= fase.mesInicio && mesAtual <= fase.mesFim;

  // Progresso dentro da fase
  let progressoFase = 0;
  if (fase.status === "concluida") progressoFase = 100;
  else if (fase.status === "em_andamento") {
    const total = fase.mesFim - fase.mesInicio + 1;
    const decorrido = mesAtual - fase.mesInicio + 1;
    progressoFase = Math.round((decorrido / total) * 100);
  }

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden transition-all ${
        isCurrent ? "border-primary/40 ring-2 ring-primary/10" : "border-border"
      } ${config.bgColor}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {/* Status icon */}
        <div className={`shrink-0 ${config.textColor}`}>{config.icon}</div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{fase.titulo}</span>
            {isCurrent && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                ATUAL
              </span>
            )}
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${config.textColor} ${
                fase.status === "concluida"
                  ? "bg-green-100 dark:bg-green-900/30"
                  : fase.status === "em_andamento"
                  ? "bg-primary/10"
                  : "bg-sidebar-accent"
              }`}
            >
              {config.emoji} {config.label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {fase.labelInicio} — {fase.labelFim}
          </p>
        </div>

        {/* Progresso */}
        {fase.status === "em_andamento" && (
          <span className="text-xs font-medium text-primary mr-1">{progressoFase}%</span>
        )}

        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Barra de progresso */}
          {fase.status === "em_andamento" && (
            <div className="h-2 rounded-full bg-sidebar-accent overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressoFase}%` }}
              />
            </div>
          )}

          {/* Descrição */}
          <p className="text-sm text-foreground/80">{fase.descricao}</p>

          {/* Entregas */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Entregas-chave
            </p>
            <ul className="space-y-1.5">
              {fase.entregas.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className={`mt-0.5 ${fase.status === "concluida" ? "text-green-500" : "text-muted-foreground"}`}>
                    {fase.status === "concluida" ? "✓" : "·"}
                  </span>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ano Section ──────────────────────────────────────────────────────────────

function AnoSection({ ano, mesAtual, isAtual }: { ano: AnoData; mesAtual: number; isAtual: boolean }) {
  const [collapsed, setCollapsed] = useState(!isAtual);

  const concluidas = ano.fases.filter((f) => f.status === "concluida").length;
  const emAndamento = ano.fases.filter((f) => f.status === "em_andamento").length;
  const total = ano.fases.length;

  return (
    <div className="mb-6">
      {/* Ano header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-3 mb-3 group"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: ano.cor }}
        >
          {ano.numero}
        </div>
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">
              Ano {ano.numero}: {ano.titulo}
            </h2>
            {isAtual && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                ATUAL
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{ano.subtitulo}</p>
        </div>
        <div className="flex items-center gap-2 mr-2">
          <span className="text-xs text-muted-foreground">
            {concluidas}/{total}
            {emAndamento > 0 && ` · ${emAndamento} em andamento`}
          </span>
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Fases */}
      {!collapsed && (
        <div className="space-y-3 pl-[52px]">
          {ano.fases.map((fase) => (
            <FaseCard key={fase.id} fase={fase} mesAtual={mesAtual} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function RoadmapClient({ anos, mesAtual, anoAtual, progressoProjeto, contadores }: Props) {
  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <h1 className="text-xl font-bold text-foreground">Roadmap — Projeto T&D</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Plano de 5 anos: Abril 2026 a Marco 2031
        </p>

        {/* Contadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-foreground">{progressoProjeto}%</p>
            <p className="text-xs text-muted-foreground">Progresso geral</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-foreground">
              Ano {anoAtual}
            </p>
            <p className="text-xs text-muted-foreground">Mes {mesAtual} do projeto</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-green-600">{contadores.concluidas}</p>
            <p className="text-xs text-muted-foreground">Fases concluidas</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-2xl font-bold text-primary">{contadores.emAndamento}</p>
            <p className="text-xs text-muted-foreground">Em andamento</p>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-8 max-w-4xl space-y-6">
        <ComoFunciona
          proposito="Roadmap longitudinal do Projeto T&D (Treinamento & Desenvolvimento) — todas as fases plurianuais, marcos e entregas previstas."
          comoUsar="Acompanhe a timeline visual: fases concluídas, em andamento e não iniciadas. Use como referência estratégica de longo prazo."
          comoAjuda="Mantém o foco no projeto maior. Operação semanal não atropela visão estratégica — o T&D continua avançando mês a mês."
        />
        {/* Timeline visual */}
        <TimelineBar mesAtual={mesAtual} anos={anos} />

        {/* Legenda */}
        <div className="flex gap-4 flex-wrap mb-6 text-xs text-muted-foreground">
          {(["concluida", "em_andamento", "nao_iniciada"] as const).map((s) => {
            const c = STATUS_CONFIG[s];
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span>{c.emoji}</span>
                <span>{c.label}</span>
              </div>
            );
          })}
        </div>

        {/* Anos */}
        {anos.map((ano) => (
          <AnoSection
            key={ano.numero}
            ano={ano}
            mesAtual={mesAtual}
            isAtual={ano.numero === anoAtual}
          />
        ))}
      </div>
    </div>
  );
}
