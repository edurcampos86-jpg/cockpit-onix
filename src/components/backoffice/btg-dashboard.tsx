"use client";

import { useState } from "react";
import { Loader2, Wallet, Users, ShieldCheck, UserCog, Activity, Clock, AlertCircle, TrendingUp, RefreshCcw } from "lucide-react";

interface SyncLog {
  id: string;
  tipo: string;
  iniciado: string;
  finalizado: string | null;
  sucesso: boolean;
  contasProcessadas: number;
  contasComErro: number;
  resumo: string | null;
}

interface PosicaoAntiga {
  id: string;
  nome: string;
  numeroConta: string;
  positionDate: string;
}

interface Props {
  totais: { aumTotal: number; saldoConta: number; totalClientes: number };
  perClasse: { classe: string; aum: number; count: number }[];
  perPerfil: { perfil: string; count: number }[];
  perAssessor: { nome: string; count: number; aum: number }[];
  ultimoImport: SyncLog | null;
  ultimoMovs: SyncLog | null;
  movs7d: number;
  movsPorTipo: { tipo: string; count: number; valorTotal: number }[];
  posicaoMaisAntiga: PosicaoAntiga | null;
}

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const moedaCompleta = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const dt = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const dtCurta = (s: string | null) => (s ? new Date(s).toLocaleDateString("pt-BR") : "—");

const PERFIL_CORES: Record<string, string> = {
  conservador: "bg-blue-500",
  moderado: "bg-amber-500",
  sofisticado: "bg-red-500",
  "não-cadastrado": "bg-zinc-400",
};

const CLASSE_CORES: Record<string, string> = {
  A: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  B: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  C: "border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400",
};

export function BtgDashboard(props: Props) {
  const [stvmLoading, setStvmLoading] = useState(false);
  const [stvmResult, setStvmResult] = useState<{ ok: boolean; msg: string; raw?: unknown } | null>(null);

  const buscarStvm = async () => {
    if (stvmLoading) return;
    setStvmLoading(true);
    setStvmResult(null);
    try {
      const res = await fetch("/api/backoffice/btg-stvm", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStvmResult({ ok: true, msg: `Período ${data.startDate} → ${data.endDate}`, raw: data.data });
      } else {
        setStvmResult({ ok: false, msg: data.message || "Erro" });
      }
    } catch (e) {
      setStvmResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setStvmLoading(false);
    }
  };

  const totalPorPerfil = props.perPerfil.reduce((s, p) => s + p.count, 0);
  const maxAssessor = Math.max(...props.perAssessor.map((a) => a.aum), 1);

  return (
    <div className="space-y-6">
      {/* Linha 1 — AUM */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard icon={Wallet} label="AUM Total" value={moedaCompleta(props.totais.aumTotal)} />
        <KpiCard icon={Wallet} label="Saldo em conta corrente" value={moedaCompleta(props.totais.saldoConta)} />
        <KpiCard icon={Users} label="Total de clientes" value={String(props.totais.totalClientes)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {props.perClasse.map((c) => (
          <div key={c.classe} className={`rounded-xl border p-4 ${CLASSE_CORES[c.classe] || ""}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-2xl font-bold">{c.classe}</span>
              <span className="text-xl font-semibold">{c.count}</span>
            </div>
            <p className="text-sm font-mono">{moeda(c.aum)}</p>
          </div>
        ))}
      </div>

      {/* Linha 2 — Distribuição */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Clientes por perfil de investidor</h3>
          </div>
          {props.perPerfil.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados ainda. Rode "Enriquecer dados" na lista de clientes.</p>
          ) : (
            <div className="space-y-2">
              {props.perPerfil.map((p) => (
                <div key={p.perfil} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{p.perfil}</span>
                    <span className="font-mono">{p.count}</span>
                  </div>
                  <div className="h-2 rounded bg-muted overflow-hidden">
                    <div
                      className={`h-full ${PERFIL_CORES[p.perfil] || "bg-zinc-400"}`}
                      style={{ width: totalPorPerfil > 0 ? `${(p.count / totalPorPerfil) * 100}%` : "0%" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Top 10 assessores por AUM</h3>
          </div>
          {props.perAssessor.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem dados de assessor ainda.</p>
          ) : (
            <div className="space-y-2">
              {props.perAssessor.map((a) => (
                <div key={a.nome} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="truncate flex-1">{a.nome}</span>
                    <span className="font-mono text-xs ml-2">{a.count} cli</span>
                    <span className="font-mono text-xs ml-2 w-24 text-right">{moeda(a.aum)}</span>
                  </div>
                  <div className="h-1.5 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${(a.aum / maxAssessor) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Linha 3 — Sincronização */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SyncStatusCard label="Última importação" log={props.ultimoImport} />
        <SyncStatusCard label="Última sync de movimentações" log={props.ultimoMovs} />
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Posição mais antiga</span>
          </div>
          {props.posicaoMaisAntiga ? (
            <div className="text-sm">
              <p className="font-medium truncate">{props.posicaoMaisAntiga.nome}</p>
              <p className="text-xs text-muted-foreground font-mono">
                Conta {props.posicaoMaisAntiga.numeroConta} · {dtCurta(props.posicaoMaisAntiga.positionDate)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {/* Movimentações 7d */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Movimentações últimos 7 dias</h3>
          <span className="text-sm text-muted-foreground">({props.movs7d} no total)</span>
        </div>
        {props.movsPorTipo.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma movimentação sincronizada nos últimos 7 dias.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="text-left py-2">Tipo</th>
                <th className="text-right py-2">Qtd</th>
                <th className="text-right py-2">Valor total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {props.movsPorTipo.map((m) => (
                <tr key={m.tipo}>
                  <td className="py-2">{m.tipo}</td>
                  <td className="text-right py-2 font-mono">{m.count}</td>
                  <td className="text-right py-2 font-mono">{moeda(m.valorTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Linha 4 — STVM/NNM */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">NNM (Net New Money) do mês</h3>
          </div>
          <button
            onClick={buscarStvm}
            disabled={stvmLoading}
            className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {stvmLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            {stvmLoading ? "Buscando..." : "Buscar NNM do mês"}
          </button>
        </div>
        {stvmResult && (
          <div className={`text-sm rounded p-3 border ${stvmResult.ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
            <p>{stvmResult.msg}</p>
            {stvmResult.raw !== undefined && (
              <pre className="mt-2 text-xs bg-background rounded p-2 overflow-auto max-h-64">
                {JSON.stringify(stvmResult.raw, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
    </div>
  );
}

function SyncStatusCard({ label, log }: { label: string; log: SyncLog | null }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      {log ? (
        <div className="text-sm space-y-1">
          <p className="text-xs text-muted-foreground">{dt(log.iniciado)}</p>
          <p>
            <span className={log.sucesso ? "text-emerald-600" : "text-red-600"}>
              {log.sucesso ? "✓ Sucesso" : "✗ Erro"}
            </span>
            {" · "}
            <span className="font-mono">{log.contasProcessadas} contas</span>
            {log.contasComErro > 0 && (
              <span className="text-red-600 font-mono"> ({log.contasComErro} erros)</span>
            )}
          </p>
          {log.resumo && <p className="text-xs text-muted-foreground line-clamp-2">{log.resumo}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma execução registrada.</p>
      )}
    </div>
  );
}
