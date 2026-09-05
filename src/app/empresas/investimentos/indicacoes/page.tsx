export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac-papeis";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { IndicacoesBoard } from "@/components/backoffice/indicacoes-board";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_INDICACOES } from "@/lib/backoffice/referencias";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { flagLigada } from "@/lib/flags/registro";
import { IndicacoesBoardV2 } from "@/components/backoffice/indicacoes/board-v2";
import type { Indicacao as IndicacaoV2 } from "@/components/backoffice/indicacoes/tipos";
import { clusterDe, MICROCOPY_INDICACOES } from "@/content/indicacoes-microcopy";

export default async function IndicacoesPage() {
  // Admin-only (espelha grupos/page.tsx). O proxy global só checa autenticação,
  // não papel — sem isto, qualquer logado abriria a tela e veria todos os clientes
  // no dropdown de "quem indicou". Independente do RBAC (que filtra LINHAS sob flag).
  const session = await getSession();
  if (!session) redirect("/login");
  if (!isAdmin({ role: session.role, pessoa: null })) redirect("/empresas/investimentos");

  /* Flag INDICACOES_V2 (default OFF): ON → Círculo de Introduções (V2);
   * OFF → renderização atual, byte a byte, mais abaixo. */
  if (flagLigada(await getConfig("INDICACOES_V2"))) {
    return <IndicacoesV2 userId={session.userId} />;
  }

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
    parceiro: { id: string; nome: string } | null;
  };

  let indicacoes: IndicacaoView[] = [];
  let clientes: Array<{ id: string; nome: string; classificacao: string }> = [];
  let parceiros: Array<{ id: string; nome: string }> = [];

  try {
    const raw = await prisma.indicacao.findMany({
      orderBy: { criadoEm: "desc" },
      include: {
        indicador: { select: { id: true, nome: true, classificacao: true } },
        parceiro: { select: { id: true, nome: true } },
      },
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
      parceiro: i.parceiro,
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
    // Só os ativos: parceiro arquivado não deve aparecer como origem de uma
    // indicação NOVA — o histórico dele continua nos cards já criados.
    parceiros = await prisma.parceiro.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
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
        <IndicacoesBoard indicacoes={indicacoes} clientes={clientes} parceiros={parceiros} />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Caminho V2 — "Círculo de Introduções" (flag INDICACOES_V2 ON).
 *
 * Diferenças de dados em relação ao caminho antigo (só aqui, como manda o
 * escopo — o caminho OFF mantém o select ATUAL):
 *  - `clientes` ganha nomeCompleto/apelido (corrige o bug do
 *    getNomeRelacionamento, que recebia só `nome`);
 *  - `indicacoes` inclui `clienteConvertidoId` (UI de conversão);
 *  - resolve o cluster PAT pelo e-mail do User da sessão (o JWT não carrega
 *    e-mail — mesma consulta que getAuthContext faz) e entrega a microcopy
 *    pronta ao client, que nunca vê o mapa de e-mails.
 * ────────────────────────────────────────────────────────────── */
async function IndicacoesV2({ userId }: { userId: string }) {
  let indicacoes: IndicacaoV2[] = [];
  let clientes: Array<{
    id: string;
    nome: string;
    nomeCompleto: string | null;
    apelido: string | null;
    classificacao: string;
  }> = [];
  let parceiros: Array<{ id: string; nome: string }> = [];
  let email: string | null = null;

  try {
    const raw = await prisma.indicacao.findMany({
      orderBy: { criadoEm: "desc" },
      include: {
        indicador: { select: { id: true, nome: true, classificacao: true } },
        parceiro: { select: { id: true, nome: true } },
      },
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
      clienteConvertidoId: i.clienteConvertidoId,
      indicador: i.indicador,
      parceiro: i.parceiro,
    }));
    // Mesmo escopo RBAC do caminho antigo (filtra SÓ o dropdown de clientes).
    const where: { assessorCge?: { in: string[] } } = {};
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const cges = await resolverCgesVisiveis(ctx);
      if (cges) where.assessorCge = { in: cges };
    }
    parceiros = await prisma.parceiro.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
    });
    clientes = await prisma.clienteBackoffice.findMany({
      where,
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        nomeCompleto: true,
        apelido: true,
        classificacao: true,
      },
    });
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    email = user?.email ?? null;
  } catch {
    // tabelas podem não existir ainda
  }

  const microcopy = MICROCOPY_INDICACOES[clusterDe(email)];

  return (
    <div className="space-y-6">
      <PageHeader title="Círculo de Introduções" description={microcopy.descricaoHeader} />
      <div className="px-8 space-y-6">
        <ComoFunciona
          proposito="Transformar convívio em crescimento: cada pessoa apresentada por um cliente ou parceiro entra aqui e caminha do primeiro contato ao convívio social até virar cliente Onix."
          comoUsar="Registre cada introdução no ritual de sábado, dispare o convite — treino, praia, mesa ou teatro — pelo WhatsApp em um toque, e arraste o cartão conforme a relação avança."
          comoAjuda="Nenhuma introdução esfria sem você ver: o quadro mostra há quantos dias cada uma está parada, quem ainda não recebeu agradecimento e quantas entraram nesta semana."
        />
        <IndicacoesBoardV2
          indicacoes={indicacoes}
          clientes={clientes}
          parceiros={parceiros}
          microcopy={microcopy}
        />
        {/* Depois do quadro por decisão: 13/16 do time são "Hoje Melhor" — a
            página privilegia número e ação; a fundamentação fica disponível. */}
        <ReferenciaLivro
          referencias={REF_INDICACOES}
          titulo="Por que introdução vale mais que indicação"
        />
      </div>
    </div>
  );
}
