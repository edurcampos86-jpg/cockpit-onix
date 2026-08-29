import { cn } from "@/lib/utils";

/**
 * Cartão de KPI compartilhado — extraído do padrão visual do `StatCard` local
 * de `/time` (src/app/time/page.tsx), com duas diferenças deliberadas:
 *
 *  - `value: string | number` — KPIs de moeda formatada ("R$ 1,2 mi") são
 *    strings; o original de /time só aceitava number.
 *  - `sublabel?` — linha auxiliar opcional sob o rótulo.
 *
 * `/time` NÃO foi migrado para cá neste PR (risco de regressão fora da flag
 * INDICACOES_V2 = zero); a migração é passo futuro.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "muted",
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone?: "primary" | "muted";
  sublabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div
        className={cn(
          "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
          tone === "primary" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-foreground leading-none truncate">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">
          {label}
          {sublabel && <span className="text-muted-foreground/70"> · {sublabel}</span>}
        </div>
      </div>
    </div>
  );
}
