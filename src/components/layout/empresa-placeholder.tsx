import { Construction } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

/* ──────────────────────────────────────────────────────────────
 * F4 — placeholder estruturado das abas das shells novas.
 * Shell primeiro, recheio depois: cada aba nasce com este corpo
 * até ganhar conteúdo próprio (página real substitui o placeholder
 * sem mexer em config nem layout).
 * ────────────────────────────────────────────────────────────── */

export function EmpresaPlaceholder({
  empresa,
  aba,
  descricao,
}: {
  empresa: string;
  aba: string;
  descricao: string;
}) {
  return (
    <div>
      <PageHeader title={`${aba} — ${empresa}`} description={descricao} />
      <div className="p-8">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-8 py-16 text-center">
          <Construction className="h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">
            Esta aba já tem endereço, falta o recheio.
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            O esqueleto da shell de {empresa} foi entregue na F4. O conteúdo de
            “{aba}” entra numa fase própria, seguindo o molde de Onix
            Investimentos.
          </p>
        </div>
      </div>
    </div>
  );
}
