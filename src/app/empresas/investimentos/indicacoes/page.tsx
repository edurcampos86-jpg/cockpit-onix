export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { IndicacoesBoard } from "@/components/backoffice/indicacoes-board";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_INDICACOES } from "@/lib/backoffice/referencias";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

export default async function IndicacoesPage() {
  // Admin-only (espelha grupos/page.tsx). O proxy global só checa autenticação,
  // não papel — sem isto, qualquer logado abriria a tela e veria todos os clientes
  // no dropdown de "quem indicou". Independente do RBAC (que filtra LINHAS sob flag).
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/empresas/investimentos");

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
    // RBAC — Camada 1 (escopo). Flag RBAC_ENFORCEMENT (default OFF) => where vazio
    // (comportamento atual). cges null (admin/sem papel/"todas"/0 CGEs) => sem filtro.
    // Filtra SÓ o dropdown de "quem indicou" (nova indicação); o histórico já
    // renderiza o indicador via include separado (indicacao.indicador, acima),
    // não depende desta lista — então não é afetado.
    const where: { assessorCge?: { in: string[] } } = {};
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const cges = await resolverCgesVisiveis(ctx);
      if (cges) where.assessorCge = { in: cges };
    }
    clientes = await prisma.clienteBackoffice.findMany({
      where,
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
