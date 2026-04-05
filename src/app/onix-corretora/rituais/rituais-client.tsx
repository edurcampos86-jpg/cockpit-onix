"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Flame,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type OcorrenciaCalendario = {
  ritualId: string;
  titulo: string;
  cor: string;
  frequencia: string;
  data: string;
  dia: number;
  realizado: boolean;
  execucaoId: string | null;
  notas: string | null;
};

type RitualResumo = {
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

type Props = {
  rituais: RitualResumo[];
  ocorrencias: OcorrenciaCalendario[];
  mes: number;
  ano: number;
  contadores: {
    totalRituais: number;
    totalOcorrenciasMes: number;
    totalRealizadosMes: number;
    maiorStreak: number;
  };
};

type TabAtiva = "calendario" | "rituais";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DIAS_HEADER = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function getMesAnterior(mes: number, ano: number) {
  return mes === 0 ? { mes: 11, ano: ano - 1 } : { mes: mes - 1, ano };
}

function getProximoMes(mes: number, ano: number) {
  return mes === 11 ? { mes: 0, ano: ano + 1 } : { mes: mes + 1, ano };
}

// ── Counter Card ─────────────────────────────────────────────────────────────

function CounterCard({ label, value, icon, color }: {
  label: string; value: string | number; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Calendar Grid ────────────────────────────────────────────────────────────

function CalendarioGrid({
  mes,
  ano,
  ocorrencias,
  onToggle,
}: {
  mes: number;
  ano: number;
  ocorrencias: OcorrenciaCalendario[];
  onToggle: (ritualId: string, data: string, realizado: boolean) => void;
}) {
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const hoje = new Date();
  const isHoje = (d: number) =>
    d === hoje.getDate() && mes === hoje.getMonth() && ano === hoje.getFullYear();

  // Agrupar ocorrências por dia
  const porDia = new Map<number, OcorrenciaCalendario[]>();
  for (const o of ocorrencias) {
    const dia = new Date(o.data).getDate();
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia)!.push(o);
  }

  const cells: React.ReactNode[] = [];

  // Espaços vazios antes do primeiro dia
  for (let i = 0; i < primeiroDia; i++) {
    cells.push(<div key={`empty-${i}`} className="min-h-[80px]" />);
  }

  // Dias do mês
  for (let d = 1; d <= diasNoMes; d++) {
    const eventos = porDia.get(d) || [];
    const passado = new Date(ano, mes, d) < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    cells.push(
      <div
        key={d}
        className={`min-h-[80px] rounded-lg border p-1.5 transition-colors ${
          isHoje(d)
            ? "border-primary bg-primary/5"
            : "border-border hover:border-border/80"
        }`}
      >
        <span
          className={`text-xs font-medium ${
            isHoje(d) ? "text-primary font-bold" : "text-muted-foreground"
          }`}
        >
          {d}
        </span>
        <div className="mt-1 space-y-0.5">
          {eventos.map((ev) => {
            const todosPerdidos = passado && !ev.realizado;
            return (
              <button
                key={`${ev.ritualId}-${d}`}
                onClick={() => onToggle(ev.ritualId, ev.data, !ev.realizado)}
                className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate transition-all ${
                  ev.realizado
                    ? "line-through opacity-60"
                    : todosPerdidos
                    ? "opacity-80"
                    : ""
                }`}
                style={{
                  backgroundColor: ev.realizado ? `${ev.cor}15` : todosPerdidos ? "#fef2f2" : `${ev.cor}20`,
                  color: ev.realizado ? ev.cor : todosPerdidos ? "#dc2626" : ev.cor,
                  borderLeft: `2px solid ${ev.realizado ? ev.cor : todosPerdidos ? "#dc2626" : ev.cor}`,
                }}
                title={`${ev.titulo} — ${ev.realizado ? "Realizado" : todosPerdidos ? "Perdido" : "Pendente"}`}
              >
                {ev.realizado ? "✓ " : todosPerdidos ? "✗ " : ""}{ev.titulo}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      {/* Header do calendário */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {DIAS_HEADER.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-muted-foreground uppercase py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-1">{cells}</div>
    </div>
  );
}

// ── Ritual Card ──────────────────────────────────────────────────────────────

function RitualCard({ ritual }: { ritual: RitualResumo }) {
  const pct = ritual.totalMes > 0 ? Math.round((ritual.realizadosMes / ritual.totalMes) * 100) : 0;
  const perdidos = ritual.totalMes - ritual.realizadosMes;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-3 h-8 rounded-full shrink-0"
            style={{ backgroundColor: ritual.cor }}
          />
          <div>
            <h3 className="text-sm font-semibold text-foreground">{ritual.titulo}</h3>
            <p className="text-xs text-muted-foreground">
              {ritual.frequenciaLabel}
              {ritual.diaSemanaLabel && ` · ${ritual.diaSemanaLabel}`}
              {" · "}{ritual.duracao}
            </p>
          </div>
        </div>
        {/* Streak */}
        {ritual.streak > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400">
            <Flame className="h-3.5 w-3.5" />
            <span className="text-xs font-bold">{ritual.streak}</span>
          </div>
        )}
      </div>

      {/* Descrição */}
      <p className="text-xs text-muted-foreground mb-3">{ritual.descricao}</p>

      {/* Progresso do mês */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>Este mes</span>
          <span>
            {ritual.realizadosMes}/{ritual.totalMes} ({pct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-sidebar-accent overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: ritual.cor }}
          />
        </div>
      </div>

      {/* Participantes */}
      {ritual.participantes.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {ritual.participantes.map((p) => p.split(" ")[0]).join(", ")}
        </div>
      )}

      {/* Alerta se perdeu algum */}
      {perdidos > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-500">
          <AlertTriangle className="h-3 w-3" />
          {perdidos} {perdidos === 1 ? "ocorrencia nao realizada" : "ocorrencias nao realizadas"}
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function RituaisClient({ rituais, ocorrencias, mes, ano, contadores }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabAtiva>("calendario");
  const [saving, setSaving] = useState(false);

  const anterior = getMesAnterior(mes, ano);
  const proximo = getProximoMes(mes, ano);

  async function handleToggle(ritualId: string, data: string, realizado: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      await fetch("/api/onix-corretora/rituais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ritualId, data, realizado }),
      });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          Rituais e Calendario
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Calendario de rituais de gestao do Projeto T&D
        </p>

        {/* Contadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <CounterCard
            label="Rituais ativos"
            value={contadores.totalRituais}
            color="bg-primary/10 text-primary"
            icon={<CalendarDays className="h-5 w-5" />}
          />
          <CounterCard
            label="Realizados no mes"
            value={`${contadores.totalRealizadosMes}/${contadores.totalOcorrenciasMes}`}
            color="bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400"
            icon={<CheckCircle2 className="h-5 w-5" />}
          />
          <CounterCard
            label="Maior streak"
            value={contadores.maiorStreak}
            color="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
            icon={<Flame className="h-5 w-5" />}
          />
          <CounterCard
            label="Pendentes"
            value={contadores.totalOcorrenciasMes - contadores.totalRealizadosMes}
            color="bg-sidebar-accent text-muted-foreground"
            icon={<Clock className="h-5 w-5" />}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 max-w-md rounded-xl bg-sidebar-accent p-1">
          <button
            onClick={() => setTab("calendario")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === "calendario"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Calendario
          </button>
          <button
            onClick={() => setTab("rituais")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === "rituais"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            Rituais ({rituais.length})
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-8 max-w-5xl">
        {tab === "calendario" && (
          <>
            {/* Navegação de mês */}
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() =>
                  router.push(`/onix-corretora/rituais?mes=${anterior.mes}&ano=${anterior.ano}`)
                }
                className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold text-foreground">
                {MESES[mes]} {ano}
              </h2>
              <button
                onClick={() =>
                  router.push(`/onix-corretora/rituais?mes=${proximo.mes}&ano=${proximo.ano}`)
                }
                className="p-2 rounded-lg hover:bg-sidebar-accent transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Legenda */}
            <div className="flex gap-3 flex-wrap mb-4">
              {rituais
                .filter((r) => r.frequencia !== "diario")
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.cor }} />
                    <span className="text-muted-foreground">{r.titulo}</span>
                  </div>
                ))}
            </div>

            <CalendarioGrid
              mes={mes}
              ano={ano}
              ocorrencias={ocorrencias}
              onToggle={handleToggle}
            />

            <p className="text-xs text-muted-foreground mt-3">
              Clique em um ritual no calendario para marcar como realizado ou desfazer.
              Rituais diarios nao aparecem no calendario para manter a leitura limpa.
            </p>
          </>
        )}

        {tab === "rituais" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rituais.map((r) => (
              <RitualCard key={r.id} ritual={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
