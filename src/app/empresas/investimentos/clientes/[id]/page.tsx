export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ClienteDetalhe } from "@/components/backoffice/cliente-detalhe";
import { ClienteBtgSection } from "@/components/backoffice/cliente-btg-section";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { perfilFatoLeituraHabilitado } from "@/lib/cockpit-reuniao/perfil-leitura-flag";
import { registroRicoHabilitado } from "@/lib/clientes-registro/flag";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext, isLideranca } from "@/lib/auth-helpers";
import { OrigemParceiroCard } from "@/components/backoffice/origem-parceiro-card";

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cliente, movimentacoes, vinculoParceiro] = await Promise.all([
    prisma.clienteBackoffice.findUnique({
      where: { id },
      include: {
        perfilDescoberta: true,
        planoUmaPagina: true,
        checklist: true,
        metas: { orderBy: { criadoEm: "desc" } },
        eventosVida: { orderBy: { data: "asc" } },
        interacoes: { orderBy: { data: "desc" }, take: 50 },
        reunioesEstruturadas: {
          orderBy: { data: "desc" },
          include: { pessoa: { select: { nomeCompleto: true, apelido: true } } },
        },
        // Perfil·Leitura: fatos versionados (read-only), ordenados p/ o
        // agrupamento "último por campo" no client. Índice [clienteId] existente.
        // L2: data da reunião de origem p/ a proveniência no rodapé.
        fatos: {
          orderBy: { criadoEm: "desc" },
          include: { reuniao: { select: { data: true } } },
        },
      },
    }),
    prisma.movimentacaoBtg.findMany({
      where: { clienteId: id },
      orderBy: { data: "desc" },
      take: 30,
    }),
    // De quem é este cliente HOJE. Primeira leitura de `ParceiroCliente` no app:
    // as tabelas da Fase 1 estão em produção desde a #306–#312 e, até aqui,
    // NADA no produto as lia — o vínculo existia no banco e não chegava a quem
    // atende. `dataFim: null` é a definição de vigente da casa (nunca comparar
    // com `now()`: `TIMESTAMP(3)` arredonda para cima e joga a linha recém
    // gravada no futuro).
    //
    // Fora do `include` do cliente de propósito: entra em paralelo aqui e não
    // engorda o objeto que é serializado inteiro para o client em três
    // componentes abaixo.
    prisma.parceiroCliente.findFirst({
      where: { clienteId: id, dataFim: null },
      select: {
        dataInicio: true,
        parceiro: { select: { id: true, nome: true, tipo: true, ativo: true } },
      },
    }),
  ]);

  if (!cliente) notFound();

  // RBAC — Camada 2 (escopo de acesso à ficha). Flag RBAC_ENFORCEMENT (default
  // OFF) → sem checagem, idêntico a hoje. ON → cliente fora do escopo do usuário
  // vira notFound() (MESMO 404 do "não existe" acima — não vaza a existência).
  // Reusa o assessorCge que a page já carregou (findUnique com include) — sem
  // segunda query.
  // Uma leitura de sessão só, reusada pelos dois usos abaixo: `getAuthContext`
  // vai ao banco atrás de Pessoa e papéis, e chamá-lo duas vezes no mesmo render
  // dobra isso sem motivo.
  const ctx = await getAuthContext();

  if (await rbacEnforcementHabilitado()) {
    if (!(await clienteVisivelPorAssessorCge(cliente.assessorCge, ctx))) {
      notFound();
    }
  }

  // O link para a ficha do parceiro só aparece para quem alcança /time/parceiros
  // (requireLideranca lá). Para os demais, o card mostra o nome sem o botão —
  // link que redireciona no clique é pior que link nenhum.
  const podeAbrirFichaParceiro = isLideranca(ctx);

  const cockpitReuniao = await cockpitReuniaoHabilitado();
  const perfilLeitura = await perfilFatoLeituraHabilitado();
  const registroRico = await registroRicoHabilitado();

  // Duas queries a mais SÓ com a flag ligada. Com ela desligada a page faz
  // exatamente as mesmas consultas de antes — o custo da feature nasce zero
  // para quem não a ligou, que é o que "flag OFF = tela idêntica" exige.
  const [proveniencias, membroDeGrupo] = registroRico
    ? await Promise.all([
        prisma.campoProveniencia.findMany({
          where: { clienteId: id },
          select: {
            campo: true,
            origem: true,
            registradoEm: true,
            reuniao: { select: { data: true } },
          },
        }),
        // `findFirst` e não `findMany`: uma conta pode estar em vários grupos,
        // mas o drawer propaga para UM. Enquanto não houver tela para escolher,
        // mostrar o primeiro e propagar para ele é honesto; mostrar vários e
        // propagar para um seria mentira de interface.
        prisma.clienteGrupoMembro.findFirst({
          where: { clienteId: id },
          orderBy: { adicionadoEm: "asc" },
          select: {
            grupo: {
              select: {
                id: true,
                nome: true,
                membros: { where: { viaGrupo: true }, select: { id: true } },
              },
            },
          },
        }),
      ])
    : [[], null];

  const grupoDoCliente = membroDeGrupo?.grupo
    ? {
        id: membroDeGrupo.grupo.id,
        nome: membroDeGrupo.grupo.nome,
        membrosQueRecebem: membroDeGrupo.grupo.membros.length,
      }
    : null;

  // Time ativo (só quando a aba está ligada). Uma query, duas listas:
  //  - `pessoas`            → "quem conduziu" no form (todas as ativas)
  //  - `pessoasComLogin`    → destinatários de roteamento (só com userId, pois
  //                           AcaoPainel.userId é FK de User, não de Pessoa)
  const timeAtivo = cockpitReuniao
    ? await prisma.pessoa.findMany({
        where: { status: "ativo" },
        select: { id: true, nomeCompleto: true, apelido: true, userId: true },
        orderBy: { nomeCompleto: "asc" },
      })
    : [];
  const pessoas = timeAtivo.map((p) => ({ id: p.id, nome: p.apelido?.trim() || p.nomeCompleto }));
  const pessoasComLogin = timeAtivo
    .filter((p) => p.userId)
    .map((p) => ({ id: p.id, nome: p.apelido?.trim() || p.nomeCompleto }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        description={
          `Conta ${cliente.numeroConta} · Classe ${cliente.classificacao}` +
          // Só aparece quando existe: cliente sem parceiro é o caso comum, e um
          // "Parceiro: —" fixo cansaria a linha em toda ficha para informar nada.
          (vinculoParceiro ? ` · Parceiro ${vinculoParceiro.parceiro.nome}` : "")
        }
      />
      <div className="px-8 space-y-6">
        <Link
          href="/empresas/investimentos/clientes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para lista de clientes
        </Link>
        {vinculoParceiro && (
          <OrigemParceiroCard
            parceiro={vinculoParceiro.parceiro}
            desde={vinculoParceiro.dataInicio}
            podeAbrirFicha={podeAbrirFichaParceiro}
          />
        )}

        <ClienteBtgSection
          cliente={JSON.parse(JSON.stringify(cliente))}
          movimentacoes={JSON.parse(JSON.stringify(movimentacoes))}
        />
        <ClienteDetalhe
          cliente={JSON.parse(JSON.stringify(cliente))}
          cockpitReuniao={cockpitReuniao}
          perfilLeitura={perfilLeitura}
          registroRico={registroRico}
          proveniencias={proveniencias.map((p) => ({
            campo: p.campo,
            origem: p.origem,
            registradoEm: p.registradoEm.toISOString(),
            reuniaoData: p.reuniao?.data.toISOString() ?? null,
          }))}
          grupoDoCliente={grupoDoCliente}
          reunioesEstruturadas={JSON.parse(
            JSON.stringify(cliente.reunioesEstruturadas),
          )}
          clienteFatos={JSON.parse(JSON.stringify(cliente.fatos))}
          pessoas={pessoas}
          pessoasComLogin={pessoasComLogin}
        />
      </div>
    </div>
  );
}
