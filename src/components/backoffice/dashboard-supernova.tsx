"use client";

import { useEffect, useState } from "react";
import { Users, TrendingUp, AlertTriangle, Target, Phone } from "lucide-react";
import Link from "next/link";

interface DashboardData {
  resumo: {
    totalClientes: number;
    aumTotal: number;
    receitaTotal: number;
    orfaosTotal: number;
  };
  porClasse: Record<string, { total: number; aum: number; receita: number }>;
  promessa: Record<string, { esperado: number; emDia: number; total: number }>;
  orfaos: Array<{
    id: string;
    nome: string;
    classificacao: string;
    saldo: number;
    ultimoContatoAt: string | null;
  }>;
  aVencer: Array<{
    id: string;
    nome: string;
    classificacao: string;
    proximoContatoAt: string | null;
  }>;
}

export function DashboardSupernova() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/backoffice/dashboard")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .finally(() => setLoading(false));
  }, []);

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(v);

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">Carregando dashboard Supernova...</p>
      </div>
    );
  }

  if (!data || data.resumo.totalClientes === 0) {
    return (
      <div className="rounded-xl border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Nenhum cliente importado. Use o upload abaixo para começar.
        </p>
      </div>
    );
  }

  const classCores: Record<string, { bg: string; text: string; border: string }> = {
    A: {
      bg: "bg-amber-50 dark:bg-amber-950/20",
      text: "text-amber-900 dark:text-amber-200",
      border: "border-amber-300 dark:border-amber-900",
    },
    B: {
      bg: "bg-blue-50 dark:bg-blue-950/20",
      text: "text-blue-900 dark:text-blue-200",
      border: "border-blue-300 dark:border-blue-900",
    },
    C: {
      bg: "bg-zinc-50 dark:bg-zinc-900/40",
      text: "text-zinc-900 dark:text-zinc-200",
      border: "border-zinc-300 dark:border-zinc-800",
    },
  };

  return (
    <div className="space-y-6">
      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
            <Users className="h-4 w-4" /> Total clientes
          </div>
          <p className="text-2xl font-bold">{data.resumo.totalClientes}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
            <TrendingUp className="h-4 w-4" /> AUM total
          </div>
          <p className="text-2xl font-bold">{moeda(data.resumo.aumTotal)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
            <Target className="h-4 w-4" /> Receita/ano
          </div>
          <p className="text-2xl font-bold">{moeda(data.resumo.receitaTotal)}</p>
        </div>
        <div
          className={`rounded-xl border p-4 ${
            data.resumo.orfaosTotal > 0
              ? "bg-red-50 border-red-300 dark:bg-red-950/20 dark:border-red-900"
              : "bg-card"
          }`}
        >
          <div className="flex items-center gap-2 mb-1 text-muted-foreground text-xs">
            <AlertTriangle className="h-4 w-4" /> Órfãos
          </div>
          <p className="text-2xl font-bold">{data.resumo.orfaosTotal}</p>
        </div>
      </div>

      {/* Promessa de serviço por classe */}
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-1">Promessa de serviço — execução anual</h3>
        <p className="text-xs text-muted-foreground mb-4">
          % de clientes de cada classe que já receberam os toques proporcionais esperados no ano.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["A", "B", "C"] as const).map((classe) => {
            const p = data.promessa[classe];
            if (!p || p.total === 0) return null;
            const pct = p.total > 0 ? Math.round((p.emDia / p.total) * 100) : 0;
            const aum = data.porClasse[classe]?.aum ?? 0;
            const cores = classCores[classe];
            return (
              <div
                key={classe}
                className={`rounded-lg border-2 p-4 ${cores.bg} ${cores.border}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-3xl font-bold ${cores.text}`}>{classe}</span>
                  <span className={`text-xs font-medium ${cores.text}`}>{p.total} clientes</span>
                </div>
                <div className="mb-2">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className={`text-sm font-medium ${cores.text}`}>Em dia</span>
                    <span className={`text-xl font-bold ${cores.text}`}>{pct}%</span>
                  </div>
                  <div className="h-2 bg-white/60 dark:bg-black/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        pct >= 80
                          ? "bg-green-500"
                          : pct >= 50
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <p className={`text-xs ${cores.text} opacity-80`}>
                  {p.emDia} de {p.total} recebendo a promessa · meta {p.esperado} toques/ano
                </p>
                <p className={`text-xs mt-1 font-mono ${cores.text} opacity-70`}>
                  AUM: {moeda(aum)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Órfãos */}
      {data.orfaos.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-red-50 dark:bg-red-950/20 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 dark:text-red-200">
                Clientes órfãos — recontato urgente
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300">
                Clientes sem contato por tempo superior ao esperado para a classe.
              </p>
            </div>
            <Link
              href="/backoffice/cadencia"
              className="text-xs font-medium text-red-900 dark:text-red-200 underline"
            >
              Ver cadência completa →
            </Link>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {data.orfaos.slice(0, 10).map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-bold text-xs w-8">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          c.classificacao === "A"
                            ? "bg-amber-200 text-amber-900"
                            : c.classificacao === "B"
                            ? "bg-blue-200 text-blue-900"
                            : "bg-zinc-200 text-zinc-800"
                        }`}
                      >
                        {c.classificacao}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{c.nome}</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      {moeda(c.saldo)}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {c.ultimoContatoAt
                        ? `Últ: ${new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR")}`
                        : "Nunca contatado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Próximos contatos */}
      {data.aVencer.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Phone className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Próximos contatos — 7 dias</h3>
          </div>
          <div className="max-h-[250px] overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {data.aVencer.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2 font-bold text-xs w-8">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          c.classificacao === "A"
                            ? "bg-amber-200 text-amber-900"
                            : c.classificacao === "B"
                            ? "bg-blue-200 text-blue-900"
                            : "bg-zinc-200 text-zinc-800"
                        }`}
                      >
                        {c.classificacao}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium">{c.nome}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground text-right">
                      {c.proximoContatoAt
                        ? new Date(c.proximoContatoAt).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
