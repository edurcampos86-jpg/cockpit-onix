import type { CacMatrix } from "@/lib/pixel/metrics";
import { cn } from "@/lib/utils";

/* Seção 4 — matriz de CAC por sub-persona × dor × projeto.
 * Grid CSS com intensidade por custo (sem lib de gráfico). */
export function CacMatrixGrid({
  matriz,
}: {
  matriz: CacMatrix & { source: "cache" | "on-demand" };
}) {
  const brl = (v: number | null) =>
    v != null
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";
  const maxCac = Math.max(...matriz.celulas.map((c) => c.cacBrl ?? 0), 1);

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-foreground">
          Matriz de performance — CAC ({matriz.janelaDias}d)
        </h3>
        <span className="text-xs text-muted-foreground">
          {matriz.source === "cache" ? "cache do sync diário" : "calculada agora"}
          {" · "}
          {new Date(matriz.computedAt).toLocaleString("pt-BR", {
            timeZone: "America/Bahia",
          })}
        </span>
      </div>
      {matriz.celulas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem dados ainda — a matriz é preenchida conforme eventos de lead
          chegam com tags de sub-persona/dor/projeto e o sync diário rateia o
          investimento.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {matriz.celulas.map((c, i) => {
            const intensidade = c.cacBrl != null ? c.cacBrl / maxCac : 0;
            return (
              <div
                key={i}
                className={cn(
                  "rounded-lg border border-border p-3",
                  intensidade > 0.66
                    ? "bg-red-500/10"
                    : intensidade > 0.33
                      ? "bg-yellow-500/10"
                      : "bg-green-500/10"
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {[c.subpersona ?? "sem persona", c.dor ?? "sem dor", c.projeto ?? "sem projeto"].join(" · ")}
                </p>
                <p className="mt-1 text-lg font-bold text-foreground">
                  {brl(c.cacBrl)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.leads} lead{c.leads === 1 ? "" : "s"} · {brl(c.custoBrl)}{" "}
                  investidos
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
