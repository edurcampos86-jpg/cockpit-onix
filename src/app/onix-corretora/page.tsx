export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, Users, CheckSquare, AlertCircle, FileText } from "lucide-react";

const VENDEDORES = ["Eduardo Campos", "Thiago Vergal", "Rose Oliveira"];

function TrendIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-4 w-4 text-green-400" />;
  if (value < 0) return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export default async function OnixCorretoraDashboard() {
  const vendedoresData = await Promise.all(
    VENDEDORES.map(async (vendedor) => {
      const ultimos = await prisma.relatorio.findMany({
        where: { vendedor },
        orderBy: { periodoInicio: "desc" },
        take: 2,
        include: {
          acoes: { select: { id: true, concluida: true } },
          metricas: true,
        },
      });

      const atual = ultimos[0] ?? null;
      const anterior = ultimos[1] ?? null;

      const acoesTotal = atual?.acoes.length ?? 0;
      const acoesConcluidas = atual?.acoes.filter((a) => a.concluida).length ?? 0;
      const acoesPendentes = acoesTotal - acoesConcluidas;

      const variacaoConversas =
        atual && anterior
          ? atual.conversasAnalisadas - anterior.conversasAnalisadas
          : 0;

      return { vendedor, atual, anterior, acoesTotal, acoesConcluidas, acoesPendentes, variacaoConversas };
    })
  );

  const totalRelatorios = await prisma.relatorio.count();
  const totalAcoesPendentes = await prisma.acao.count({ where: { concluida: false } });
  const ultimaExecucao = await prisma.relatorio.findFirst({ orderBy: { createdAt: "desc" } });

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Onix Corretora"
        description="Acompanhamento semanal de desenvolvimento comercial"
      />

      <div className="p-8 space-y-8">
        {/* Resumo geral */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="text-sm text-muted-foreground">Relatorios gerados</span>
            </div>
            <p className="text-3xl font-bold">{totalRelatorios}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <span className="text-sm text-muted-foreground">Acoes pendentes</span>
            </div>
            <p className="text-3xl font-bold">{totalAcoesPendentes}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-5 w-5 text-blue-400" />
              <span className="text-sm text-muted-foreground">Ultima execucao</span>
            </div>
            <p className="text-base font-semibold">
              {ultimaExecucao
                ? new Date(ultimaExecucao.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "Nenhum ainda"}
            </p>
          </div>
        </div>

        {/* Cards por vendedor */}
        {totalRelatorios === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum relatorio ainda</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Execute o pipeline de relatorios semanais para que os dados apareçam aqui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {vendedoresData.map(({ vendedor, atual, acoesConcluidas, acoesTotal, acoesPendentes, variacaoConversas }) => (
              <div key={vendedor} className="rounded-xl border border-border bg-card p-6 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Vendedor</p>
                    <h3 className="text-base font-semibold">{vendedor}</h3>
                    {atual && (
                      <p className="text-xs text-muted-foreground mt-0.5">{atual.periodo}</p>
                    )}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-primary text-sm font-bold">
                      {vendedor.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                </div>

                {atual ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-sidebar-accent p-3">
                        <p className="text-[11px] text-muted-foreground mb-1">Conversas</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xl font-bold">{atual.conversasAnalisadas}</span>
                          <TrendIcon value={variacaoConversas} />
                          {variacaoConversas !== 0 && (
                            <span className={`text-xs ${variacaoConversas > 0 ? "text-green-400" : "text-red-400"}`}>
                              {variacaoConversas > 0 ? "+" : ""}{variacaoConversas}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg bg-sidebar-accent p-3">
                        <p className="text-[11px] text-muted-foreground mb-1">Acoes</p>
                        <div className="flex items-center gap-1.5">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xl font-bold">{acoesConcluidas}</span>
                          <span className="text-xs text-muted-foreground">/ {acoesTotal}</span>
                        </div>
                      </div>
                    </div>

                    {acoesPendentes > 0 && (
                      <div className="flex items-center gap-2 rounded-lg bg-yellow-400/10 border border-yellow-400/20 px-3 py-2">
                        <AlertCircle className="h-4 w-4 text-yellow-400 shrink-0" />
                        <span className="text-xs text-yellow-300">
                          {acoesPendentes} {acoesPendentes === 1 ? "acao pendente" : "acoes pendentes"}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-auto">
                      <Link
                        href={`/onix-corretora/relatorios/${atual.id}`}
                        className="flex-1 text-center text-xs py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                      >
                        Ver relatorio
                      </Link>
                      <Link
                        href={`/onix-corretora/acoes?vendedor=${encodeURIComponent(vendedor)}`}
                        className="flex-1 text-center text-xs py-2 rounded-lg bg-sidebar-accent text-muted-foreground hover:text-foreground hover:bg-sidebar-border transition-colors font-medium"
                      >
                        Ver acoes
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum relatorio gerado ainda.</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
