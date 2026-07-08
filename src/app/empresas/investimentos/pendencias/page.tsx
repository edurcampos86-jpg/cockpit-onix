export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { getAuthContext } from "@/lib/auth-helpers";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { pendenciasAbertasHabilitado } from "@/lib/cockpit-reuniao/pendencias-flag";
import { derivarPendenciasGlobais } from "@/lib/cockpit-reuniao/pendencias-globais";
import { PendenciasAbertas } from "@/components/backoffice/pendencias-abertas";

/**
 * Tela GLOBAL de pendências de reunião abertas (Tarefas pós-reunião · T2).
 * Read-only. Gated pela flag PENDENCIAS_ABERTAS (OFF → notFound, sem superfície
 * nova). Escopo RBAC (Camada 1, listas): sem enforcement ou escopo null → tudo;
 * senão só reuniões de clientes cujo assessorCge o usuário enxerga.
 */
export default async function PendenciasPage() {
  if (!(await pendenciasAbertasHabilitado())) notFound();

  let cges: string[] | null = null;
  if (await rbacEnforcementHabilitado()) {
    cges = await resolverCgesVisiveis(await getAuthContext());
  }
  // cges === null → sem filtro (admin/sem-papel/enforcement OFF). Lista restrita
  // é sempre não-vazia; { in: [] } por segurança seria fail-closed (mostra nada).
  const where =
    cges === null ? {} : { cliente: { assessorCge: { in: cges } } };

  const reunioes = await prisma.reuniaoEstruturada.findMany({
    where,
    select: {
      id: true,
      data: true,
      dataRetorno: true,
      pendencias: true,
      cliente: { select: { id: true, nome: true } },
    },
  });

  const input = reunioes.map((r) => ({
    reuniaoId: r.id,
    data: r.data.toISOString(),
    dataRetorno: r.dataRetorno ? r.dataRetorno.toISOString() : null,
    clienteId: r.cliente.id,
    clienteNome: r.cliente.nome,
    pendencias: r.pendencias,
  }));

  const dados = derivarPendenciasGlobais(input, new Date().toISOString());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pendências de reunião"
        description={`${dados.totalAbertas} abertas · ${dados.totalAtrasadas} atrasadas · ${dados.totalClientes} clientes`}
      />
      <div className="px-8">
        <PendenciasAbertas dados={dados} />
      </div>
    </div>
  );
}
