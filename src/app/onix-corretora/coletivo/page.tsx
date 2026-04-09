export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { FileText, Printer, Users } from "lucide-react";
import { GerarColetivoButton } from "@/components/onix-corretora/gerar-coletivo-button";
import { ComoFunciona } from "@/components/layout/como-funciona";

export default async function ColetivoPage() {
  // Buscar relatorios coletivos existentes
  const relatorios = await prisma.relatorioColetivo.findMany({
    orderBy: { periodoInicio: "desc" },
  });

  // Buscar periodos disponiveis (relatorios individuais de Thiago/Rose que ainda nao tem coletivo)
  const vendedoresAlvo = ["Thiago Vergal", "Rose Oliveira"];

  const relatoriosIndividuais = await prisma.relatorio.findMany({
    where: { vendedor: { in: vendedoresAlvo } },
    select: { vendedor: true, periodo: true, periodoInicio: true, periodoFim: true },
    orderBy: { periodoInicio: "desc" },
  });

  // Agrupar por periodo
  const periodosMap = new Map<string, {
    periodo: string;
    periodoInicio: Date;
    periodoFim: Date;
    vendedores: string[];
  }>();

  for (const r of relatoriosIndividuais) {
    const key = r.periodoInicio.toISOString();
    if (!periodosMap.has(key)) {
      periodosMap.set(key, {
        periodo: r.periodo,
        periodoInicio: r.periodoInicio,
        periodoFim: r.periodoFim,
        vendedores: [],
      });
    }
    const entry = periodosMap.get(key)!;
    if (!entry.vendedores.includes(r.vendedor)) {
      entry.vendedores.push(r.vendedor);
    }
  }

  // Filtrar periodos que ainda nao tem coletivo gerado
  const periodosComColetivo = new Set(
    relatorios.map(r => r.periodoInicio.toISOString())
  );

  const periodosDisponiveis = Array.from(periodosMap.values())
    .filter(p => !periodosComColetivo.has(p.periodoInicio.toISOString()))
    .map(p => ({
      periodo: p.periodo,
      periodoInicio: p.periodoInicio.toISOString(),
      periodoFim: p.periodoFim.toISOString(),
      vendedores: p.vendedores,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Padroes Coletivos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visao consolidada do time comercial para a reuniao de terca-feira
        </p>
      </div>

      <ComoFunciona
        proposito="Síntese coletiva dos relatórios individuais — padrões comuns do time, gargalos compartilhados e oportunidades sistêmicas para a reunião semanal."
        comoUsar="Gere o relatório coletivo a partir dos relatórios individuais já existentes. Use como pauta da reunião comercial de terça-feira."
        comoAjuda="Acelera reuniões. Em vez de revisar cada vendedor isolado, foca no que afeta o time todo — economiza tempo e aumenta o impacto das decisões."
      />

      {/* Botao de gerar */}
      <GerarColetivoButton periodos={periodosDisponiveis} />

      {/* Lista de relatorios coletivos */}
      {relatorios.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Nenhum relatorio coletivo gerado ainda
          </h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Use o botao acima para gerar a partir dos relatorios individuais de Thiago e Rose.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Historico
          </h2>
          {relatorios.map((rel) => {
            const vendedores = rel.vendedoresAnalisados.split(",");

            return (
              <div
                key={rel.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">
                      {rel.periodo}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {vendedores.length} assessores · Gerado em{" "}
                      {new Date(rel.dataExecucao).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/onix-corretora/coletivo/${rel.id}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ver
                  </Link>
                  <Link
                    href={`/onix-corretora/coletivo/${rel.id}/print`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                  >
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
  );
}
