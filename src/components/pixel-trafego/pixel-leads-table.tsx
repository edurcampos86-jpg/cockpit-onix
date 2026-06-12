import Link from "next/link";
import { cn } from "@/lib/utils";

type LeadRow = {
  id: string;
  name: string;
  email: string | null;
  stage: string;
  temperature: string;
  enteredAt: string;
  sourceSubpersona: string | null;
  sourceDor: string | null;
  sourceProjeto: string | null;
};

/* Seção 3 — leads com origem de tracking; filtro por sub-persona via
 * querystring (server-rendered, sem estado no cliente). */
export function PixelLeadsTable({
  leads,
  subpersonas,
  subpersonaAtiva,
}: {
  leads: LeadRow[];
  subpersonas: string[];
  subpersonaAtiva?: string;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">
          Leads do tráfego pago
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <Link
            href="/pixel-trafego"
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              !subpersonaAtiva
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            Todas
          </Link>
          {subpersonas.map((s) => (
            <Link
              key={s}
              href={`/pixel-trafego?subpersona=${encodeURIComponent(s)}`}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                subpersonaAtiva === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {s}
            </Link>
          ))}
        </div>
      </div>
      {leads.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum lead com origem de tracking ainda — eles aparecem aqui quando
          o Pixel do MSP começar a enviar eventos com email/telefone.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 pr-4">Lead</th>
                <th className="pb-2 pr-4">Etapa</th>
                <th className="pb-2 pr-4">Sub-persona</th>
                <th className="pb-2 pr-4">Dor</th>
                <th className="pb-2 pr-4">Projeto</th>
                <th className="pb-2">Entrada</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    <span className="font-medium text-foreground">{l.name}</span>
                    {l.email && (
                      <span className="block text-xs text-muted-foreground">
                        {l.email}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">{l.stage}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {l.sourceSubpersona ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {l.sourceDor ?? "—"}
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {l.sourceProjeto ?? "—"}
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {new Date(l.enteredAt).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
