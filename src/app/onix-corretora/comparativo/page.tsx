export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const VENDEDORES = ["Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function Delta({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <TrendingUp className="h-3.5 w-3.5" />+{value}
      </span>
    );
  if (value < 0)
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
        <TrendingDown className="h-3.5 w-3.5" />{value}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <Minus className="h-3.5 w-3.5" />0
    </span>
  );
}

export default async function ComparativoPage() {
  const vendedoresData = await Promise.all(
    VENDEDORES.map(async (vendedor) => {
      const historico = await prisma.metrica.findMany({
        where: { vendedor },
        orderBy: { createdAt: "asc" },
        take: 8,
        include: { relatorio: { select: { periodo: true } } },
      });
      return { vendedor, historico };
    })
  );

  const temDados = vendedoresData.some((v) => v.historico.length > 0);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Comparativo"
        description="Evolucao das metricas semana a semana por vendedor"
      />

      <div className="p-8 space-y-10">
        {!temDados ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sem historico ainda</h3>
            <p className="text-sm text-muted-foreground">
              Os graficos comparativos aparecem a partir do segundo relatorio gerado.
            </p>
          </div>
        ) : (
          vendedoresData.map(({ vendedor, historico }) => {
            if (historico.length === 0) return null;

            const maxConversas = Math.max(...historico.map((h) => h.conversasAnalisadas), 1);

            return (
              <div key={vendedor} className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold mb-6">{vendedor}</h3>

                {/* Grafico de barras simples */}
                <div className="mb-8">
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">Conversas analisadas</p>
                  <div className="flex items-end gap-3 h-32">
                    {historico.map((h, i) => {
                      const altura = Math.round((h.conversasAnalisadas / maxConversas) * 100);
                      return (
                        <div key={h.id} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">{h.conversasAnalisadas}</span>
                          <div
                            className="w-full rounded-t-md bg-primary/70 transition-all"
                            style={{ height: `${altura}%` }}
                          />
                          <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                            {h.relatorio.periodo.split(" a ")[0]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tabela de metricas */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Semana</th>
                        <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium">Conversas</th>
                        <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium">Sem resposta</th>
                        <th className="text-right py-2 px-4 text-xs text-muted-foreground font-medium">Reunioes</th>
                        <th className="text-right py-2 pl-4 text-xs text-muted-foreground font-medium">Leads perdidos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historico.map((h, i) => {
                        const anterior = historico[i - 1];
                        return (
                          <tr key={h.id} className="border-b border-border/50 last:border-0">
                            <td className="py-3 pr-4 text-xs">{h.relatorio.periodo}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.conversasAnalisadas}</span>
                                {anterior && <Delta value={h.conversasAnalisadas - anterior.conversasAnalisadas} />}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.conversasSemResposta}</span>
                                {anterior && <Delta value={-(h.conversasSemResposta - anterior.conversasSemResposta)} />}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.reunioesAgendadas}</span>
                                {anterior && <Delta value={h.reunioesAgendadas - anterior.reunioesAgendadas} />}
                              </div>
                            </td>
                            <td className="py-3 pl-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.leadsPerdidos}</span>
                                {anterior && <Delta value={-(h.leadsPerdidos - anterior.leadsPerdidos)} />}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
