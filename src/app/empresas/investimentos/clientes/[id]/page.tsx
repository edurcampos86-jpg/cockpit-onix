export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ClienteDetalhe } from "@/components/backoffice/cliente-detalhe";
import { ClienteBtgSection } from "@/components/backoffice/cliente-btg-section";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { rbacEnforcementHabilitado, clienteVisivelPorAssessorCge } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [cliente, movimentacoes] = await Promise.all([
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
      },
    }),
    prisma.movimentacaoBtg.findMany({
      where: { clienteId: id },
      orderBy: { data: "desc" },
      take: 30,
    }),
  ]);

  if (!cliente) notFound();

  // RBAC — Camada 2 (escopo de acesso à ficha). Flag RBAC_ENFORCEMENT (default
  // OFF) → sem checagem, idêntico a hoje. ON → cliente fora do escopo do usuário
  // vira notFound() (MESMO 404 do "não existe" acima — não vaza a existência).
  // Reusa o assessorCge que a page já carregou (findUnique com include) — sem
  // segunda query.
  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    if (!(await clienteVisivelPorAssessorCge(cliente.assessorCge, ctx))) {
      notFound();
    }
  }

  const cockpitReuniao = await cockpitReuniaoHabilitado();

  // Opções de "quem conduziu" (time ativo) — só carrega quando a aba está ligada.
  const pessoas = cockpitReuniao
    ? (
        await prisma.pessoa.findMany({
          where: { status: "ativo" },
          select: { id: true, nomeCompleto: true, apelido: true },
          orderBy: { nomeCompleto: "asc" },
        })
      ).map((p) => ({ id: p.id, nome: p.apelido?.trim() || p.nomeCompleto }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        description={`Conta ${cliente.numeroConta} · Classe ${cliente.classificacao}`}
      />
      <div className="px-8 space-y-6">
        <Link
          href="/empresas/investimentos/clientes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para lista de clientes
        </Link>
        <ClienteBtgSection
          cliente={JSON.parse(JSON.stringify(cliente))}
          movimentacoes={JSON.parse(JSON.stringify(movimentacoes))}
        />
        <ClienteDetalhe
          cliente={JSON.parse(JSON.stringify(cliente))}
          cockpitReuniao={cockpitReuniao}
          reunioesEstruturadas={JSON.parse(
            JSON.stringify(cliente.reunioesEstruturadas),
          )}
          pessoas={pessoas}
        />
      </div>
    </div>
  );
}
