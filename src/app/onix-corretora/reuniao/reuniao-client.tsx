"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ComoFunciona } from "@/components/layout/como-funciona";
import {
  Users,
  User,
  ChevronDown,
  FileText,
  CheckSquare,
  Circle,
  ExternalLink,
  MessageSquare,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Periodo = { label: string; value: string };

type ColetivoData = {
  id: string;
  periodo: string;
  vendedoresAnalisados: string;
  metricasConsolidadas: string | null;
  scoreIndividual: string | null;
  termometroTime: string | null;
  objecoesRecorrentes: string | null;
  padroesPositivos: string | null;
  padroesRisco: string | null;
  scriptColetivo: string | null;
  planoColetivo: string | null;
  cumprimentoAnterior: string | null;
};

type VendedorData = {
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

type Props = {
  periodoAtual: string;
  periodos: Periodo[];
  coletivo: ColetivoData | null;
  vendedores: VendedorData[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return { text: "text-green-600", bg: "bg-green-50", border: "border-green-200" };
  if (score >= 60) return { text: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" };
  return { text: "text-red-600", bg: "bg-red-50", border: "border-red-200" };
}

function truncateText(text: string, maxLines: number = 4): string {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length <= maxLines) return lines.join("\n");
  return lines.slice(0, maxLines).join("\n") + "\n...";
}

// ── Section Box (Coletivo) ───────────────────────────────────────────────────

function SectionBox({
  title,
  color,
  bgColor,
  icon,
  children,
}: {
  title: string;
  color: string;
  bgColor: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl overflow-hidden border border-border">
      <div
        className="px-4 py-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide"
        style={{ background: color, color: "#fff" }}
      >
        {icon}
        {title}
      </div>
      <div
        className="p-5 text-sm leading-relaxed whitespace-pre-wrap"
        style={{ background: bgColor }}
      >
        {children}
      </div>
    </div>
  );
}

// ── PAT Badge ────────────────────────────────────────────────────────────────

function PatBadge({ pat }: { pat: VendedorData["pat"] }) {
  if (!pat) return null;
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ backgroundColor: pat.corBg, color: pat.corPrimaria }}
    >
      PAT {pat.numero} — {pat.titulo}
    </div>
  );
}

// ── Metric Pill ──────────────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex flex-col items-center px-3 py-2 rounded-lg bg-card border border-border min-w-[80px]">
      <span className={`text-lg font-bold ${color || "text-foreground"}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
    </div>
  );
}

// ── Tab Component ────────────────────────────────────────────────────────────

function TabBar({
  active,
  onChange,
}: {
  active: "coletivo" | "individual";
  onChange: (tab: "coletivo" | "individual") => void;
}) {
  return (
    <div className="flex rounded-xl bg-sidebar-accent p-1 gap-1">
      <button
        onClick={() => onChange("coletivo")}
        className={`flex items-center justify-center gap-2 flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
          active === "coletivo"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Users className="h-4 w-4" />
        Reuniao do Time
      </button>
      <button
        onClick={() => onChange("individual")}
        className={`flex items-center justify-center gap-2 flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
          active === "individual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <User className="h-4 w-4" />
        Individual
      </button>
    </div>
  );
}

// ── Period Selector ──────────────────────────────────────────────────────────

function PeriodoSelector({
  periodos,
  atual,
}: {
  periodos: Periodo[];
  atual: string;
}) {
  const router = useRouter();
  return (
    <div className="relative">
      <select
        value={atual}
        onChange={(e) =>
          router.push(`/onix-corretora/reuniao?periodo=${encodeURIComponent(e.target.value)}`)
        }
        className="appearance-none bg-card border border-border rounded-lg px-4 py-2 pr-8 text-sm font-medium text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        {periodos.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ── Vendedor Card (Individual Tab) ───────────────────────────────────────────

function VendedorCard({ v }: { v: VendedorData }) {
  const [expanded, setExpanded] = useState(false);
  const score = v.metricas?.score ?? 0;
  const sc = scoreColor(score);
  const acoesTotal = v.acoes.length;
  const acoesConcluidas = v.acoes.filter((a) => a.concluida).length;
  const pctAcoes = acoesTotal > 0 ? Math.round((acoesConcluidas / acoesTotal) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header com avatar e PAT */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{
                backgroundColor: v.pat?.corBg || "#f3f4f6",
                color: v.pat?.corPrimaria || "#6b7280",
              }}
            >
              {v.pat?.emoji || v.vendedor.charAt(0)}
            </div>
            <div>
              <h3 className="font-semibold text-sm">{v.vendedor}</h3>
              <PatBadge pat={v.pat} />
            </div>
          </div>
          {score > 0 && (
            <div
              className={`px-3 py-1.5 rounded-lg text-sm font-bold ${sc.text} ${sc.bg} border ${sc.border}`}
            >
              {score}
            </div>
          )}
        </div>

        {/* Calibração PAT */}
        {v.pat && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-sidebar-accent/50 border border-border">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground/70">Tom calibrado:</span>{" "}
              {v.pat.tomRelatorio}
            </p>
          </div>
        )}

        {/* Métricas rápidas */}
        <div className="flex gap-2 flex-wrap mb-3">
          <MetricPill label="Conversas" value={v.conversasAnalisadas} />
          {v.metricas && (
            <>
              <MetricPill
                label="Sem resposta"
                value={v.metricas.conversasSemResposta}
                color={v.metricas.conversasSemResposta > 3 ? "text-red-500" : "text-foreground"}
              />
              <MetricPill
                label="Reunioes"
                value={v.metricas.reunioesAgendadas}
                color="text-green-600"
              />
              <MetricPill
                label="Perdidos"
                value={v.metricas.leadsPerdidos}
                color={v.metricas.leadsPerdidos > 0 ? "text-red-500" : "text-foreground"}
              />
            </>
          )}
        </div>

        {/* Ações progresso */}
        {acoesTotal > 0 && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Plano de acao</span>
              <span>
                {acoesConcluidas}/{acoesTotal} ({pctAcoes}%)
              </span>
            </div>
            <div className="h-2 rounded-full bg-sidebar-accent overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pctAcoes}%` }}
              />
            </div>
          </div>
        )}

        {/* Expandir detalhes */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-center text-xs font-medium text-primary hover:text-primary/80 transition-colors py-1.5"
        >
          {expanded ? "Recolher" : "Expandir analise"}
        </button>
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Abordagens positivas */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-2">
              Abordagens Positivas
            </h4>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {truncateText(v.secao1, 6)}
            </p>
          </div>

          {/* Oportunidades de melhoria */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-yellow-600 mb-2">
              Oportunidades de Melhoria
            </h4>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
              {truncateText(v.secao2, 6)}
            </p>
          </div>

          {/* Script sugerido */}
          {v.scriptSemana && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-primary mb-2 flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" />
                Script da Semana
              </h4>
              <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
                {v.scriptSemana}
              </p>
            </div>
          )}

          {/* Ações da semana */}
          {v.acoes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-600 mb-2">
                Plano de Acao Individual
              </h4>
              <div className="space-y-1.5">
                {v.acoes.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    {a.concluida ? (
                      <CheckSquare className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                    <span className={a.concluida ? "line-through text-muted-foreground" : ""}>
                      {a.titulo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link para relatório completo */}
          <Link
            href={`/onix-corretora/relatorios/${v.id}`}
            className="flex items-center justify-center gap-2 text-xs font-medium text-primary py-2 px-4 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Ver relatorio completo
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ReuniaoClient({ periodoAtual, periodos, coletivo, vendedores }: Props) {
  const [activeTab, setActiveTab] = useState<"coletivo" | "individual">("coletivo");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reuniao Semanal</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Formato C — Visao coletiva + analises individuais calibradas por PAT
            </p>
          </div>
          <PeriodoSelector periodos={periodos} atual={periodoAtual} />
        </div>

        {/* Tabs */}
        <div className="mt-5 max-w-md">
          <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-8 space-y-6">
        <ComoFunciona
          proposito="Pauta da reunião comercial semanal no Formato C: visão do time + análise individual calibrada pelo perfil PAT de cada vendedor."
          comoUsar="Comece pela aba 'Coletivo' (15 min de time), depois 'Individual' para cada um. Cada análise individual já vem com tom adaptado ao PAT do vendedor."
          comoAjuda="Estrutura a reunião que mais consome tempo do gestor. Garante que toda terça você sai com clareza, alinhamento e plano — não com listas de problemas."
        />
        {activeTab === "coletivo" ? (
          <ColetivoTab coletivo={coletivo} />
        ) : (
          <IndividualTab vendedores={vendedores} />
        )}
      </div>
    </div>
  );
}

// ── Tab: Reunião do Time ─────────────────────────────────────────────────────

function ColetivoTab({ coletivo }: { coletivo: ColetivoData | null }) {
  if (!coletivo) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Users className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhum relatorio coletivo disponivel</h3>
        <p className="text-sm text-muted-foreground">
          Gere o relatorio coletivo da semana para ver a visao do time aqui.
        </p>
        <Link
          href="/onix-corretora/coletivo"
          className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Ir para Padroes Coletivos
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  const vendedores = coletivo.vendedoresAnalisados.split(",").map((v) => v.trim());

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Info bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-foreground">{coletivo.periodo}</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">{vendedores.length} assessores analisados</span>
        <span className="text-xs text-muted-foreground">·</span>
        <span className="text-xs text-muted-foreground">
          {vendedores.map((v) => v.split(" ")[0]).join(", ")}
        </span>
        <Link
          href={`/onix-corretora/coletivo/${coletivo.id}/print`}
          target="_blank"
          className="ml-auto text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Exportar PDF
        </Link>
      </div>

      {/* Parte Pública — para a reunião de segunda */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 px-5 py-3 mb-2">
        <p className="text-xs font-semibold text-primary uppercase tracking-wide">
          Parte Publica — Para discutir na reuniao de segunda
        </p>
      </div>

      {/* Métricas consolidadas */}
      {coletivo.metricasConsolidadas && (
        <SectionBox title="Metricas do Time" color="#C9A84C" bgColor="var(--card)">
          {coletivo.metricasConsolidadas}
        </SectionBox>
      )}

      {/* Score Individual */}
      {coletivo.scoreIndividual && (
        <SectionBox title="Score por Assessor" color="#C9A84C" bgColor="var(--card)">
          {coletivo.scoreIndividual}
        </SectionBox>
      )}

      {/* Termômetro */}
      {coletivo.termometroTime && (
        <SectionBox title="Termometro do Time" color="#C9A84C" bgColor="var(--card)">
          {coletivo.termometroTime}
        </SectionBox>
      )}

      {/* Objeções Recorrentes */}
      {coletivo.objecoesRecorrentes && (
        <SectionBox
          title="Objecoes Encontradas — Aprendizado Compartilhado"
          color="#1565C0"
          bgColor="var(--card)"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
        >
          {coletivo.objecoesRecorrentes}
        </SectionBox>
      )}

      {/* Padrões Positivos */}
      {coletivo.padroesPositivos && (
        <SectionBox title="Padroes Positivos da Semana" color="#2E7D32" bgColor="var(--card)">
          {coletivo.padroesPositivos}
        </SectionBox>
      )}

      {/* Padrões de Risco */}
      {coletivo.padroesRisco && (
        <SectionBox title="Alertas Coletivos" color="#9F1239" bgColor="var(--card)">
          {coletivo.padroesRisco}
        </SectionBox>
      )}

      {/* Script Coletivo */}
      {coletivo.scriptColetivo && (
        <SectionBox
          title="Script Coletivo — Copiar e Usar"
          color="#C9A84C"
          bgColor="var(--card)"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
        >
          {coletivo.scriptColetivo}
        </SectionBox>
      )}

      {/* Plano Coletivo */}
      {coletivo.planoColetivo && (
        <SectionBox title="Plano de Acao Coletivo — Proxima Semana" color="#D4610A" bgColor="var(--card)">
          {coletivo.planoColetivo}
        </SectionBox>
      )}

      {/* Cumprimento da semana anterior */}
      {coletivo.cumprimentoAnterior && (
        <SectionBox title="Retomada — Plano da Semana Anterior" color="#6B7280" bgColor="var(--card)">
          {coletivo.cumprimentoAnterior}
        </SectionBox>
      )}
    </div>
  );
}

// ── Tab: Análises Individuais ────────────────────────────────────────────────

function IndividualTab({ vendedores }: { vendedores: VendedorData[] }) {
  if (vendedores.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <User className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Nenhum relatorio individual neste periodo</h3>
        <p className="text-sm text-muted-foreground">
          Execute o pipeline semanal para gerar os relatorios individuais.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Banner */}
      <div className="rounded-xl border-2 border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30 px-5 py-3 mb-5">
        <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">
          Parte Individual — Enviada separadamente para cada pessoa
        </p>
        <p className="text-xs text-violet-600/80 dark:text-violet-400/60 mt-0.5">
          Cada analise esta calibrada ao perfil comportamental (PAT) do assessor
        </p>
      </div>

      {/* Cards por vendedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {vendedores.map((v) => (
          <VendedorCard key={v.id} v={v} />
        ))}
      </div>
    </div>
  );
}
