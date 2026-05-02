"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Target,
  TrendingUp,
  CheckCircle2,
  Clock,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ComoFunciona } from "@/components/layout/como-funciona";

// ── Types ────────────────────────────────────────────────────────────────────

type FaseComStatus = {
  numero: number;
  titulo: string;
  mesInicio: number;
  mesFim: number;
  objetivos: string[];
  kpisMeta: Record<string, number>;
  status: "concluida" | "em_andamento" | "futura";
  progresso: number;
  labelInicio: string;
  labelFim: string;
};

type HistoricoItem = {
  periodo: string;
  score: number;
  taxaResposta: number;
  reunioes: number;
  data: string;
};

type PatData = {
  numero: number;
  titulo: string;
  emoji: string;
  corPrimaria: string;
  corBg: string;
  palavrasChave: string[];
  resumo: string;
} | null;

type Props = {
  vendedor: string;
  pat: PatData;
  cargoAtual: string;
  cargoAlvo: string;
  fases: FaseComStatus[];
  faseAtualNumero: number | null;
  progressoGeral: number;
  proximoMarco: { titulo: string; mesesRestantes: number } | null;
  historico: HistoricoItem[];
  scoreAtual: number;
  scoreMeta: number;
};

// ── SVG Line Chart ───────────────────────────────────────────────────────────

function LineChart({
  data,
  dataKey,
  meta,
  color,
  label,
}: {
  data: HistoricoItem[];
  dataKey: keyof HistoricoItem;
  meta?: number;
  color: string;
  label: string;
}) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Sem dados de {label} para exibir</p>
      </div>
    );
  }

  const W = 600;
  const H = 200;
  const PAD = { top: 20, right: 20, bottom: 40, left: 45 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = data.map((d) => Number(d[dataKey]));
  const maxVal = Math.max(...values, meta ?? 0, 10);
  const minVal = 0;
  const range = maxVal - minVal || 1;

  const points = values.map((v, i) => {
    const x = PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const y = PAD.top + innerH - ((v - minVal) / range) * innerH;
    return { x, y, v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  // Gradient fill
  const areaD =
    pathD +
    ` L ${points[points.length - 1].x} ${PAD.top + innerH} L ${points[0].x} ${PAD.top + innerH} Z`;

  // Meta line
  const metaY = meta != null ? PAD.top + innerH - ((meta - minVal) / range) * innerH : null;

  // Y axis ticks
  const yTicks = [0, 25, 50, 75, 100].filter((t) => t <= maxVal + 5);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {label}
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t) => {
          const y = PAD.top + innerH - ((t - minVal) / range) * innerH;
          return (
            <g key={t}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                stroke="var(--border)"
                strokeWidth="0.5"
                strokeDasharray="4 4"
              />
              <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                {t}
              </text>
            </g>
          );
        })}

        {/* Meta line */}
        {metaY != null && (
          <>
            <line
              x1={PAD.left}
              y1={metaY}
              x2={W - PAD.right}
              y2={metaY}
              stroke={color}
              strokeWidth="1"
              strokeDasharray="6 3"
              opacity="0.5"
            />
            <text
              x={W - PAD.right + 2}
              y={metaY + 3}
              fontSize="9"
              fill={color}
              fontWeight="600"
            >
              Meta
            </text>
          </>
        )}

        {/* Area fill */}
        {data.length > 1 && <path d={areaD} fill={`url(#grad-${dataKey})`} />}

        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} />
            <circle cx={p.x} cy={p.y} r="2.5" fill="var(--card)" />
            {/* Value label on last point */}
            {i === points.length - 1 && (
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
                {p.v}
              </text>
            )}
          </g>
        ))}

        {/* X axis labels */}
        {data.map((d, i) => {
          const x = PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
          // Show every Nth label to avoid overlap
          const step = Math.max(1, Math.floor(data.length / 6));
          if (i % step !== 0 && i !== data.length - 1) return null;
          const shortLabel = d.periodo.split(" ")[0] || d.periodo.slice(0, 5);
          return (
            <text
              key={i}
              x={x}
              y={H - 8}
              textAnchor="middle"
              fontSize="9"
              fill="var(--muted-foreground)"
            >
              {shortLabel}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ── Fase Card ────────────────────────────────────────────────────────────────

function FaseCard({ fase, isCurrent }: { fase: FaseComStatus; isCurrent: boolean }) {
  const [expanded, setExpanded] = useState(isCurrent);

  const statusConfig = {
    concluida: {
      icon: <CheckCircle2 className="h-5 w-5 text-green-500" />,
      border: "border-green-200",
      bg: "bg-green-50/50 dark:bg-green-950/20",
      label: "Concluida",
      labelColor: "text-green-600",
    },
    em_andamento: {
      icon: <Clock className="h-5 w-5 text-primary" />,
      border: "border-primary/30",
      bg: "bg-primary/5",
      label: "Em andamento",
      labelColor: "text-primary",
    },
    futura: {
      icon: <Circle className="h-5 w-5 text-muted-foreground" />,
      border: "border-border",
      bg: "",
      label: "Futura",
      labelColor: "text-muted-foreground",
    },
  };

  const config = statusConfig[fase.status];

  return (
    <div
      className={`rounded-xl border ${config.border} ${config.bg} overflow-hidden transition-all ${
        isCurrent ? "ring-2 ring-primary/20" : ""
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        {config.icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              Fase {fase.numero}: {fase.titulo}
            </span>
            {isCurrent && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                ATUAL
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {fase.labelInicio} a {fase.labelFim} · {config.label}
          </p>
        </div>
        {fase.status === "em_andamento" && (
          <span className="text-xs font-medium text-primary mr-2">{fase.progresso}%</span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Barra de progresso (se em andamento) */}
          {fase.status === "em_andamento" && (
            <div className="h-2 rounded-full bg-sidebar-accent overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${fase.progresso}%` }}
              />
            </div>
          )}

          {/* Objetivos */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Objetivos
            </p>
            <ul className="space-y-1.5">
              {fase.objetivos.map((obj, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="text-muted-foreground mt-0.5">
                    {fase.status === "concluida" ? "✓" : "·"}
                  </span>
                  {obj}
                </li>
              ))}
            </ul>
          </div>

          {/* Metas KPI */}
          <div className="flex gap-3 flex-wrap">
            {Object.entries(fase.kpisMeta).map(([key, val]) => {
              const labels: Record<string, string> = {
                score: "Score",
                taxaResposta: "Resposta 24h",
                reunioes: "Reunioes/sem",
              };
              return (
                <div
                  key={key}
                  className="px-3 py-1.5 rounded-lg bg-card border border-border text-xs"
                >
                  <span className="text-muted-foreground">{labels[key] || key}: </span>
                  <span className="font-semibold text-foreground">
                    {key === "taxaResposta" ? `${val}%` : val}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TrilhaClient({
  vendedor,
  pat,
  cargoAtual,
  cargoAlvo,
  fases,
  faseAtualNumero,
  progressoGeral,
  proximoMarco,
  historico,
  scoreAtual,
  scoreMeta,
}: Props) {
  const [activeChart, setActiveChart] = useState<"score" | "taxaResposta" | "reunioes">("score");

  const faseAtual = fases.find((f) => f.numero === faseAtualNumero);

  const chartConfig = {
    score: { color: "#FFB114", label: "Score Semanal", meta: scoreMeta },
    taxaResposta: { color: "#0EA5E9", label: "Taxa de Resposta 24h (%)", meta: faseAtual?.kpisMeta.taxaResposta },
    reunioes: { color: "#22C55E", label: "Reunioes Agendadas", meta: faseAtual?.kpisMeta.reunioes },
  };

  const chart = chartConfig[activeChart];

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex items-center gap-3 mb-4">
          <Link
            href="/onix-corretora/desenvolvimento"
            className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-3">
            {pat && (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: pat.corBg, color: pat.corPrimaria }}
              >
                {pat.emoji}
              </div>
            )}
            <div>
              <h1 className="text-xl font-bold text-foreground">{vendedor}</h1>
              <p className="text-sm text-muted-foreground">
                {cargoAtual} → {cargoAlvo}
              </p>
            </div>
          </div>
        </div>

        {/* PAT info */}
        {pat && (
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span
              className="px-2.5 py-1 rounded-full text-xs font-semibold"
              style={{ backgroundColor: pat.corBg, color: pat.corPrimaria }}
            >
              PAT {pat.numero} — {pat.titulo}
            </span>
            {pat.palavrasChave.map((p) => (
              <span
                key={p}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sidebar-accent text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        )}

        {/* Progresso geral + Score */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
          {/* Progresso */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Progresso geral</p>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-foreground">{progressoGeral}%</span>
            </div>
            <div className="h-2 rounded-full bg-sidebar-accent overflow-hidden mt-2">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressoGeral}%` }}
              />
            </div>
          </div>

          {/* Score atual */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Score atual</p>
            <div className="flex items-end gap-2">
              <span
                className={`text-2xl font-bold ${
                  scoreAtual >= scoreMeta ? "text-green-600" : "text-yellow-600"
                }`}
              >
                {scoreAtual}
              </span>
              <span className="text-xs text-muted-foreground mb-1">/ meta {scoreMeta}</span>
            </div>
          </div>

          {/* Próximo marco */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Proximo marco</p>
            {proximoMarco ? (
              <>
                <p className="text-sm font-semibold text-foreground">{proximoMarco.titulo}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Em {proximoMarco.mesesRestantes} {proximoMarco.mesesRestantes === 1 ? "mes" : "meses"}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Ultima fase em andamento</p>
            )}
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-8 space-y-8 max-w-4xl">
        <ComoFunciona
          proposito="Trilha de desenvolvimento individual: cargo atual → cargo alvo, fases com objetivos e KPIs de meta, benchmark evolutivo (score, taxa de resposta, reuniões) e próximo marco."
          comoUsar="Acompanhe a fase atual e o que ainda falta. Use o gráfico pra ver evolução semanal versus a meta da fase. O resumo do PAT no topo lembra como calibrar a comunicação durante coaching."
          comoAjuda="Transforma carreira em algo concreto e mensurável — a pessoa sabe onde está, o que falta e o que será cobrado. O gestor coacheia com base em dados, não em sensação."
        />
        {/* Benchmark Evolutivo */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Benchmark Evolutivo
            </h2>
          </div>

          {/* Chart selector */}
          <div className="flex gap-2 flex-wrap mb-4">
            {(["score", "taxaResposta", "reunioes"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setActiveChart(key)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeChart === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-sidebar-accent text-muted-foreground hover:text-foreground"
                }`}
              >
                {chartConfig[key].label}
              </button>
            ))}
          </div>

          <LineChart
            data={historico}
            dataKey={activeChart}
            meta={chart.meta}
            color={chart.color}
            label={chart.label}
          />
        </section>

        {/* Timeline de Fases */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              Trilha de Carreira
            </h2>
          </div>

          <div className="space-y-3">
            {fases.map((fase) => (
              <FaseCard
                key={fase.numero}
                fase={fase}
                isCurrent={fase.numero === faseAtualNumero}
              />
            ))}
          </div>
        </section>

        {/* Perfil comportamental */}
        {pat && (
          <section>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Perfil Comportamental
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{pat.resumo}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
