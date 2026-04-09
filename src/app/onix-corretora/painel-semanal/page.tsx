export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { PainelClient } from "./painel-client";
import {
  computeResultado,
  computeProcesso,
  computeComportamento,
} from "@/lib/painel-utils";

export default async function PainelSemanalPage() {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const ano = now.getFullYear();

  // Camada 1 — Resultado: meta mensal
  const metaMensal = await prisma.metaMensal.findUnique({
    where: { mes_ano: { mes, ano } },
  });

  // Camada 2 — Processo: negocios ativos no pipeline
  const deals = await prisma.negocioPipeline.findMany({
    where: { ativo: true },
    orderBy: { ultimaAtividade: "desc" },
  });

  // Camada 3 — Comportamento: metricas da semana mais recente
  // Busca o relatório mais recente para pegar o período
  const ultimoRelatorio = await prisma.relatorio.findFirst({
    orderBy: { periodoInicio: "desc" },
    select: { periodoInicio: true, periodoFim: true },
  });

  let metricas: Array<{
    vendedor: string;
    conversasAnalisadas: number;
    conversasSemResposta: number;
    score: number;
  }> = [];

  let periodoLabel = `Semana de ${now.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`;

  if (ultimoRelatorio) {
    metricas = await prisma.metrica.findMany({
      where: {
        relatorio: {
          periodoInicio: { gte: ultimoRelatorio.periodoInicio },
        },
      },
      select: {
        vendedor: true,
        conversasAnalisadas: true,
        conversasSemResposta: true,
        score: true,
      },
    });

    const inicio = ultimoRelatorio.periodoInicio.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });
    const fim = ultimoRelatorio.periodoFim.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    periodoLabel = `${inicio} a ${fim}`;
  }

  const resultado = computeResultado(metaMensal);
  const processo = computeProcesso(deals);
  const comportamento = computeComportamento(metricas);

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Painel Semanal"
        description="Visao executiva: resultado, processo e comportamento"
      />
      <div className="p-4 md:p-8 space-y-6">
        <ComoFunciona
          proposito="Visão executiva da semana em três dimensões: resultado (o que entregou), processo (como executou) e comportamento (como agiu)."
          comoUsar="Leia as três colunas em conjunto. Resultado fraco com bom processo é diferente de resultado fraco com mau processo — o painel mostra a causa raiz."
          comoAjuda="Evita decisões só por número. Separa quem está executando bem mas teve azar de quem precisa mesmo mudar comportamento."
        />
        <PainelClient
          resultado={resultado}
          processo={processo}
          comportamento={comportamento}
          periodoLabel={periodoLabel}
        />
      </div>
    </div>
  );
}
