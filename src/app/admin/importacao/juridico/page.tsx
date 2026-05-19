import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { ImportClient } from "./_components/import-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Importar Jurídico — Cockpit Onix" };
export const dynamic = "force-dynamic";

export default async function ImportacaoJuridicoPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const jobs = await prisma.importJob.findMany({
    where: { tipo: "juridico_zip" },
    orderBy: { iniciadoEm: "desc" },
    take: 20,
  });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Importação em lote — Jurídico"
        description="One-shot: ZIP da pasta 5.Jurídico do OneDrive → cofre Cockpit."
      />
      <div className="p-8 space-y-6 max-w-5xl">
        <ComoFunciona
          proposito="Migrar o passivo de contratos do OneDrive pro Cockpit em uma operação. Cada PDF dentro do ZIP vira um ContratoArquivo no B2, com extração via Claude rodando em background."
          comoUsar="Compacta a pasta 5.Jurídico inteira num ZIP (qualquer estrutura de subpastas funciona — só PDFs são processados). Sobe até 500MB por vez. Acompanha progresso aqui."
          comoAjuda="Idempotente via hash SHA-256: pode rodar o mesmo ZIP de novo que ele só pula duplicatas, não duplica. Status pendente_revisao — cada contrato aparece em /juridico/contratos pra você revisar+aprovar."
        />

        <ImportClient />

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-4 py-2 text-sm font-medium">
            Histórico de jobs ({jobs.length})
          </div>
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Início</th>
                <th className="px-3 py-2 font-medium">ZIP</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Progresso</th>
                <th className="px-3 py-2 font-medium">Sucesso / Pulado / Erro</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                    {new Date(j.iniciadoEm).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="truncate max-w-[250px]" title={j.zipFilename || ""}>
                      {j.zipFilename || "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {j.zipBytes ? `${(Number(j.zipBytes) / 1024 / 1024).toFixed(1)} MB` : "—"}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={cn(
                        "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                        j.status === "completed"
                          ? "bg-green-500/15 text-green-700 dark:text-green-300"
                          : j.status === "failed"
                            ? "bg-destructive/15 text-destructive"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                      )}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {j.processados} / {j.totalArquivos}
                    {j.totalArquivos > 0 && (
                      <span className="text-muted-foreground text-[10px] ml-2">
                        ({Math.round((j.processados / j.totalArquivos) * 100)}%)
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[11px]">
                    <span className="text-green-600">{j.sucessos}</span>
                    {" / "}
                    <span className="text-amber-600">{j.pulados}</span>
                    {" / "}
                    <span className="text-destructive">{j.erros}</span>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-muted-foreground">
                    Nenhuma importação ainda. Suba o primeiro ZIP acima.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
