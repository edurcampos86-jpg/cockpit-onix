"use client";

import {
  TrendingUp,
  Users,
  Phone,
  Calendar,
  CheckCircle2,
  Target,
  UserPlus,
  Award,
  DollarSign,
} from "lucide-react";
import Link from "next/link";

interface Props {
  data: {
    kpis: {
      totalClientes: number;
      clientesA: number;
      clientesB: number;
      clientesC: number;
      aumTotal: number;
      receitaAnual: number;
      interacoes30d: number;
      interacoesAno: number;
      reuniaoesAno: number;
      revisoesAno: number;
      indicacoesRecebidasAno: number;
      indicacoesConvertidasAno: number;
      taxaConversaoIndicacoes: number;
      cumprimentoPromessaA: number;
      metasAtivas: number;
      metasAtingidas: number;
    };
    topClientes: Array<{
      id: string;
      nome: string;
      classificacao: string;
      saldo: number;
      receitaAnual: number;
    }>;
    porMes: Array<{ mes: string; ligacoes: number; reunioes: number; revisoes: number }>;
  };
}

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const classCores: Record<string, string> = {
  A: "bg-amber-200 text-amber-900",
  B: "bg-blue-200 text-blue-900",
  C: "bg-zinc-200 text-zinc-800",
};

export function PerformanceDashboard({ data }: Props) {
  const { kpis, topClientes, porMes } = data;
  const maxToques = Math.max(
    1,
    ...porMes.map((m) => m.ligacoes + m.reunioes + m.revisoes)
  );

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          icon={Users}
          label="Total clientes"
          value={String(kpis.totalClientes)}
          sub={`A:${kpis.clientesA} · B:${kpis.clientesB} · C:${kpis.clientesC}`}
        />
        <Kpi icon={DollarSign} label="AUM total" value={moeda(kpis.aumTotal)} />
        <Kpi icon={TrendingUp} label="Receita anual" value={moeda(kpis.receitaAnual)} />
        <Kpi
          icon={Award}
          label="Cumprimento promessa A"
          value={`${kpis.cumprimentoPromessaA}%`}
          highlight={
            kpis.cumprimentoPromessaA >= 80
              ? "green"
              : kpis.cumprimentoPromessaA >= 50
              ? "amber"
              : "red"
          }
        />
      </div>

      {/* KPIs de execução */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Execução da cadência (ano corrente)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi icon={Phone} label="Toques nos últimos 30d" value={String(kpis.interacoes30d)} />
          <Kpi icon={Phone} label="Toques no ano" value={String(kpis.interacoesAno)} />
          <Kpi icon={Calendar} label="Reuniões no ano" value={String(kpis.reuniaoesAno)} />
          <Kpi icon={CheckCircle2} label="Revisões no ano" value={String(kpis.revisoesAno)} />
        </div>
      </div>

      {/* Indicações e metas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Indicações no ano
          </h3>
          <div className="space-y-3">
            <Linha label="Recebidas" value={String(kpis.indicacoesRecebidasAno)} />
            <Linha label="Convertidas" value={String(kpis.indicacoesConvertidasAno)} />
            <Linha label="Taxa de conversão" value={`${kpis.taxaConversaoIndicacoes}%`} />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Target className="h-4 w-4" /> Metas dos clientes
          </h3>
          <div className="space-y-3">
            <Linha label="Metas ativas" value={String(kpis.metasAtivas)} />
            <Linha label="Metas atingidas" value={String(kpis.metasAtingidas)} />
            <Linha
              label="Taxa de realização"
              value={
                kpis.metasAtivas + kpis.metasAtingidas > 0
                  ? `${Math.round(
                      (kpis.metasAtingidas / (kpis.metasAtivas + kpis.metasAtingidas)) * 100
                    )}%`
                  : "0%"
              }
            />
          </div>
        </div>
      </div>

      {/* Gráfico de toques por mês (barras simples CSS) */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Toques por mês (12 meses)</h3>
        {porMes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem dados ainda.</p>
        ) : (
          <div className="space-y-2">
            {porMes.map((m) => {
              const total = m.ligacoes + m.reunioes + m.revisoes;
              const pct = (total / maxToques) * 100;
              return (
                <div key={m.mes} className="flex items-center gap-3 text-xs">
                  <span className="w-16 font-mono text-muted-foreground">{m.mes}</span>
                  <div className="flex-1 h-6 bg-muted rounded overflow-hidden flex">
                    <div
                      className="bg-blue-400 h-full"
                      style={{ width: `${(m.ligacoes / maxToques) * 100}%` }}
                      title={`${m.ligacoes} ligações`}
                    />
                    <div
                      className="bg-purple-400 h-full"
                      style={{ width: `${(m.reunioes / maxToques) * 100}%` }}
                      title={`${m.reunioes} reuniões`}
                    />
                    <div
                      className="bg-green-400 h-full"
                      style={{ width: `${(m.revisoes / maxToques) * 100}%` }}
                      title={`${m.revisoes} revisões`}
                    />
                  </div>
                  <span className="w-10 text-right font-semibold">{total}</span>
                  <span className="w-8 text-right text-[10px] text-muted-foreground">
                    {Math.round(pct)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-blue-400" /> Ligações
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-400" /> Reuniões
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-400" /> Revisões
          </span>
        </div>
      </div>

      {/* Top 10 clientes */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-semibold">Top 10 clientes por AUM</h3>
        </div>
        {topClientes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Sem clientes cadastrados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Classe</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Nome</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">AUM</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Receita/ano</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {topClientes.map((c, i) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        classCores[c.classificacao] ?? classCores.C
                      }`}
                    >
                      {c.classificacao}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link
                      href={`/backoffice/clientes/${c.id}`}
                      className="hover:underline hover:text-primary"
                    >
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{moeda(c.saldo)}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                    {moeda(c.receitaAnual)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub?: string;
  highlight?: "green" | "amber" | "red";
}) {
  const cor =
    highlight === "green"
      ? "border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
      : highlight === "amber"
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900"
      : highlight === "red"
      ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-900"
      : "";
  return (
    <div className={`rounded-xl border bg-card p-4 ${cor}`}>
      <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
