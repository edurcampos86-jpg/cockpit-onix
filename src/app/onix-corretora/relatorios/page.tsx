export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import Link from "next/link";
import { CheckSquare, FileText, Printer } from "lucide-react";

const VENDEDORES = ["Todos", "Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function scoreColor(score: number) {
  if (score >= 80) return "text-green-400 bg-green-400/10";
  if (score >= 60) return "text-yellow-400 bg-yellow-400/10";
  return "text-red-400 bg-red-400/10";
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ vendedor?: string }>;
}) {
  const { vendedor } = await searchParams;
  const filtro = vendedor && vendedor !== "Todos" ? vendedor : undefined;

  const relatorios = await prisma.relatorio.findMany({
    where: filtro ? { vendedor: filtro } : undefined,
    orderBy: { periodoInicio: "desc" },
    include: {
      acoes: { select: { id: true, concluida: true } },
      metricas: { select: { score: true } },
    },
  });

  return (
    <div className="min-h-screen">
      <PageHeader title="Relatorios Semanais" description="Historico de analises de desenvolvimento comercial" />

      <div className="p-8 space-y-6">
        <ComoFunciona
          proposito="Histórico de todos os relatórios semanais de análise de conversas comerciais já gerados pelo pipeline de IA."
          comoUsar="Filtre por vendedor, abra um relatório para ver a análise completa, vá para 'Ações' para ver o checklist ou exporte em PDF para imprimir."
          comoAjuda="Memória institucional do desenvolvimento comercial. Permite comparar evolução semana após semana e identificar padrões de longo prazo."
        />

        <div className="flex flex-wrap gap-2">
          {VENDEDORES.map((v) => {
            const isActive = (!filtro && v === "Todos") || filtro === v;
            return (
              <Link key={v}
                href={v === "Todos" ? "/onix-corretora/relatorios" : `/onix-corretora/relatorios?vendedor=${encodeURIComponent(v)}`}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-sidebar-accent text-muted-foreground hover:text-foreground"}`}>
                {v}
              </Link>
            );
          })}
        </div>

        {relatorios.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum relatorio encontrado</h3>
            <p className="text-sm text-muted-foreground">Execute o pipeline semanal para gerar o primeiro relatorio.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {relatorios.map((r) => {
              const total = r.acoes.length;
              const concluidas = r.acoes.filter((a) => a.concluida).length;
              const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0;
              const score = r.metricas?.score ?? 0;

              return (
                <div key={r.id} className="rounded-xl border border-border bg-card p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-0.5">
                        {r.vendedor.split(" ")[0]}
                      </span>
                      <span className="text-sm font-semibold">{r.periodo}</span>
                      {score > 0 && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${scoreColor(score)}`}>
                          Score {score}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {r.conversasAnalisadas} conversas · {new Date(r.dataExecucao).toLocaleDateString("pt-BR")}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 sm:w-36">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Acoes</span>
                        <span>{concluidas}/{total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-sidebar-accent overflow-hidden">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/onix-corretora/relatorios/${r.id}`}
                      className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium">
                      <FileText className="h-3.5 w-3.5" />
                      Ver
                    </Link>
                    <Link href={`/onix-corretora/acoes?relatorioId=${r.id}`}
                      className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors font-medium">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Acoes
                    </Link>
                    <Link href={`/onix-corretora/relatorios/${r.id}/print`} target="_blank"
                      className="flex items-center gap-1.5 text-xs py-2 px-3 rounded-lg bg-sidebar-accent text-muted-foreground hover:text-foreground transition-colors font-medium"
                      title="Exportar PDF">
                      <Printer className="h-3.5 w-3.5" />
                      PDF
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
