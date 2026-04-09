export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { TrendingUp, TrendingDown, Minus, Target } from "lucide-react";

const VENDEDORES = ["Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function Delta({ value, inverse = false }: { value: number; inverse?: boolean }) {
  const positive = inverse ? value < 0 : value > 0;
  const negative = inverse ? value > 0 : value < 0;
  if (positive)
    return (
      <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
        <TrendingUp className="h-3.5 w-3.5" />+{Math.abs(value)}
      </span>
    );
  if (negative)
    return (
      <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
        <TrendingDown className="h-3.5 w-3.5" />-{Math.abs(value)}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <Minus className="h-3.5 w-3.5" />0
    </span>
  );
}

function ScoreBar({ score, meta }: { score: number; meta?: number }) {
  const color = score >= 80 ? "bg-green-400" : score >= 60 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-sidebar-accent overflow-hidden relative">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(score, 100)}%` }} />
        {meta !== undefined && (
          <div
            className="absolute top-0 bottom-0 w-px bg-primary/60"
            style={{ left: `${Math.min(meta, 100)}%` }}
            title={`Meta: ${meta}`}
          />
        )}
      </div>
      <span className={`text-xs font-semibold w-7 text-right ${score >= 80 ? "text-green-400" : score >= 60 ? "text-yellow-400" : "text-red-400"}`}>
        {score}
      </span>
    </div>
  );
}

export default async function ComparativoPage() {
  const [vendedoresData, todasMetas] = await Promise.all([
    Promise.all(
      VENDEDORES.map(async (vendedor) => {
        const historico = await prisma.metrica.findMany({
          where: { vendedor },
          orderBy: { createdAt: "asc" },
          take: 8,
          include: { relatorio: { select: { periodo: true } } },
        });
        return { vendedor, historico };
      })
    ),
    prisma.meta.findMany(),
  ]);

  const metaMap: Record<string, Record<string, number>> = {};
  for (const m of todasMetas) {
    if (!metaMap[m.vendedor]) metaMap[m.vendedor] = {};
    metaMap[m.vendedor][m.metrica] = m.valor;
  }

  const temDados = vendedoresData.some((v) => v.historico.length > 0);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Comparativo"
        description="Evolucao das metricas semana a semana por vendedor"
      />

      <div className="p-8 space-y-10">
        <ComoFunciona
          proposito="Visão lado a lado da evolução de cada vendedor: score, conversas, ações e métricas-chave semana após semana."
          comoUsar="Compare as barras e deltas para identificar quem está melhorando, quem estagnou e quem regrediu. Use a meta como referência visual."
          comoAjuda="Tira a subjetividade do acompanhamento. Ranking objetivo permite reconhecer evolução real e priorizar atenção em quem mais precisa."
        />

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

            const metas = metaMap[vendedor] ?? {};
            const maxConversas = Math.max(...historico.map((h) => h.conversasAnalisadas), metas.conversas ?? 1, 1);

            return (
              <div key={vendedor} className="rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold">{vendedor}</h3>
                  {Object.keys(metas).length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Target className="h-3.5 w-3.5" />
                      Metas definidas
                    </div>
                  )}
                </div>

                {/* Grafico de barras: conversas */}
                <div className="mb-8">
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
                    Conversas analisadas
                    {metas.conversas && (
                      <span className="ml-2 text-primary">· Meta: {metas.conversas}</span>
                    )}
                  </p>
                  <div className="flex items-end gap-3 h-32">
                    {historico.map((h) => {
                      const altura = Math.round((h.conversasAnalisadas / maxConversas) * 100);
                      const abaixo = metas.conversas && h.conversasAnalisadas < metas.conversas;
                      return (
                        <div key={h.id} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-xs text-muted-foreground">{h.conversasAnalisadas}</span>
                          <div
                            className={`w-full rounded-t-md transition-all ${abaixo ? "bg-yellow-400/60" : "bg-primary/70"}`}
                            style={{ height: `${altura}%` }}
                          />
                          <span className="text-[10px] text-muted-foreground text-center leading-tight truncate w-full">
                            {h.relatorio.periodo.split(" a ")[0]}
                          </span>
                        </div>
                      );
                    })}
                    {/* linha de meta visual */}
                    {metas.conversas && (
                      <div className="flex-1 flex flex-col items-center gap-1 opacity-40">
                        <span className="text-xs text-primary">{metas.conversas}</span>
                        <div
                          className="w-full rounded-t-md border-2 border-dashed border-primary"
                          style={{ height: `${Math.round((metas.conversas / maxConversas) * 100)}%` }}
                        />
                        <span className="text-[10px] text-primary">Meta</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Score trend */}
                {historico.some((h) => h.score > 0) && (
                  <div className="mb-6">
                    <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wide">
                      Score semanal
                      {metas.score && <span className="ml-2 text-primary">· Meta: {metas.score}</span>}
                    </p>
                    <div className="space-y-2">
                      {historico.filter(h => h.score > 0).map((h) => (
                        <div key={h.id} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-24 shrink-0 truncate">
                            {h.relatorio.periodo.split(" a ")[0]}
                          </span>
                          <div className="flex-1">
                            <ScoreBar score={h.score} meta={metas.score} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tabela de metricas */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 text-xs text-muted-foreground font-medium">Semana</th>
                        <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Conversas</th>
                        <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Sem resposta</th>
                        <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Reunioes</th>
                        <th className="text-right py-2 px-3 text-xs text-muted-foreground font-medium">Perdidos</th>
                        <th className="text-right py-2 pl-3 text-xs text-muted-foreground font-medium">Score</th>
                      </tr>
                      {Object.keys(metas).length > 0 && (
                        <tr className="border-b border-border/30 bg-primary/5">
                          <td className="py-1.5 pr-4 text-xs text-primary font-medium flex items-center gap-1">
                            <Target className="h-3 w-3" /> Meta
                          </td>
                          <td className="py-1.5 px-3 text-right text-xs text-primary">{metas.conversas ?? "—"}</td>
                          <td className="py-1.5 px-3 text-right text-xs text-primary">{metas.semResposta ?? "—"}</td>
                          <td className="py-1.5 px-3 text-right text-xs text-primary">{metas.reunioes ?? "—"}</td>
                          <td className="py-1.5 px-3 text-right text-xs text-primary">{metas.perdidos ?? "—"}</td>
                          <td className="py-1.5 pl-3 text-right text-xs text-primary">{metas.score ?? "—"}</td>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {historico.map((h, i) => {
                        const anterior = historico[i - 1];
                        return (
                          <tr key={h.id} className="border-b border-border/50 last:border-0">
                            <td className="py-3 pr-4 text-xs">{h.relatorio.periodo}</td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className={metas.conversas && h.conversasAnalisadas < metas.conversas ? "text-yellow-400" : ""}>{h.conversasAnalisadas}</span>
                                {anterior && <Delta value={h.conversasAnalisadas - anterior.conversasAnalisadas} />}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.conversasSemResposta}</span>
                                {anterior && <Delta value={h.conversasSemResposta - anterior.conversasSemResposta} inverse />}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.reunioesAgendadas}</span>
                                {anterior && <Delta value={h.reunioesAgendadas - anterior.reunioesAgendadas} />}
                              </div>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span>{h.leadsPerdidos}</span>
                                {anterior && <Delta value={h.leadsPerdidos - anterior.leadsPerdidos} inverse />}
                              </div>
                            </td>
                            <td className="py-3 pl-3 text-right">
                              {h.score > 0 ? (
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                  h.score >= 80 ? "text-green-400 bg-green-400/10" :
                                  h.score >= 60 ? "text-yellow-400 bg-yellow-400/10" :
                                  "text-red-400 bg-red-400/10"
                                }`}>
                                  {h.score}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
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
