import type { Funnel } from "@/lib/pixel/metrics";

/* Seção 2 — funil de conversão em barras CSS (sem lib de gráfico,
 * padrão dos dashboards existentes). */
export function ConversionFunnel({ funnel }: { funnel: Funnel }) {
  const max = Math.max(...funnel.etapas.map((e) => e.volume), 1);
  const brl = (v: number | null) =>
    v != null
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-foreground">
          Funil de conversão (7 dias)
        </h3>
        <span className="text-xs text-muted-foreground">
          Investimento na janela: {brl(funnel.spendTotalBrl)}
        </span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Impressões e cliques vêm dos snapshots de campanha; PageView em diante
        vem dos eventos do Pixel no MSP.
      </p>
      <div className="space-y-2">
        {funnel.etapas.map((e) => (
          <div key={e.etapa} className="flex items-center gap-3">
            <span className="w-44 shrink-0 text-sm text-muted-foreground">
              {e.etapa}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary transition-all"
                style={{ width: `${Math.max((e.volume / max) * 100, e.volume > 0 ? 2 : 0)}%` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-semibold text-foreground">
              {e.volume.toLocaleString("pt-BR")}
            </span>
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
              {brl(e.custoMedioBrl)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
