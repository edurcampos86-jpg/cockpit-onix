export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { IndicacoesBoard } from "@/components/backoffice/indicacoes-board";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_INDICACOES } from "@/lib/backoffice/referencias";

export default async function IndicacoesPage() {
  type IndicacaoView = {
    id: string;
    nomeIndicado: string;
    emailIndicado: string | null;
    telefoneIndicado: string | null;
    status: string;
    valorEstimado: number | null;
    agradecimentoEnviado: boolean;
    notas: string | null;
    criadoEm: string;
    indicador: { id: string; nome: string; classificacao: string } | null;
  };

  let indicacoes: IndicacaoView[] = [];
  let clientes: Array<{ id: string; nome: string; classificacao: string }> = [];

  try {
    const raw = await prisma.indicacao.findMany({
      orderBy: { criadoEm: "desc" },
      include: { indicador: { select: { id: true, nome: true, classificacao: true } } },
    });
    indicacoes = raw.map((i) => ({
      id: i.id,
      nomeIndicado: i.nomeIndicado,
      emailIndicado: i.emailIndicado,
      telefoneIndicado: i.telefoneIndicado,
      status: i.status,
      valorEstimado: i.valorEstimado,
      agradecimentoEnviado: i.agradecimentoEnviado,
      notas: i.notas,
      criadoEm: i.criadoEm.toISOString(),
      indicador: i.indicador,
    }));
    clientes = await prisma.clienteBackoffice.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, classificacao: true },
    });
  } catch {
    // tabelas podem não existir ainda
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM de Indicações"
        description="Cada cliente A é uma fonte potencial de outros clientes A. Rastreie cada indicação."
      />
      <div className="px-8 space-y-6">
        <ComoFunciona
          proposito="Pipeline visual de cada indicação recebida — de quem veio, em que estágio está e quanto vale."
          comoUsar="Cadastre toda nova indicação, mova pelo kanban conforme avança e marque o agradecimento ao indicador."
          comoAjuda="Garante que nenhuma indicação se perca e que o cliente que indicou seja sempre reconhecido — o que gera mais indicações."
        />
        <ReferenciaLivro
          referencias={REF_INDICACOES}
          titulo="Por que indicações são a alavanca de crescimento"
        />
        <IndicacoesBoard indicacoes={indicacoes} clientes={clientes} />
      </div>
    </div>
  );
}
