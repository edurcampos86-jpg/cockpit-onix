export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { BtgDashboard } from "@/components/backoffice/btg-dashboard";

export default async function BtgDashboardPage() {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    todosClientes,
    perClasse,
    perPerfil,
    perAssessor,
    ultimoImport,
    ultimoMovs,
    movs7d,
    movsPorTipo,
    posicaoMaisAntiga,
  ] = await Promise.all([
    prisma.clienteBackoffice.aggregate({
      _sum: { saldo: true, saldoConta: true },
      _count: { _all: true },
    }),
    prisma.clienteBackoffice.groupBy({
      by: ["classificacao"],
      _sum: { saldo: true },
      _count: { _all: true },
    }),
    prisma.clienteBackoffice.groupBy({
      by: ["perfilInvestidor"],
      _count: { _all: true },
    }),
    prisma.clienteBackoffice.groupBy({
      by: ["assessorNome"],
      _count: { _all: true },
      _sum: { saldo: true },
      orderBy: { _sum: { saldo: "desc" } },
      take: 10,
    }),
    prisma.btgSyncLog.findFirst({
      where: { tipo: "import" },
      orderBy: { iniciado: "desc" },
    }),
    prisma.btgSyncLog.findFirst({
      where: { tipo: "movements" },
      orderBy: { iniciado: "desc" },
    }),
    prisma.movimentacaoBtg.count({ where: { data: { gte: since7d } } }),
    prisma.movimentacaoBtg.groupBy({
      by: ["tipo"],
      where: { data: { gte: since7d } },
      _count: { _all: true },
      _sum: { valor: true },
      orderBy: { _count: { tipo: "desc" } },
      take: 5,
    }),
    prisma.clienteBackoffice.findFirst({
      where: { positionDate: { not: null } },
      orderBy: { positionDate: "asc" },
      select: { id: true, nome: true, numeroConta: true, positionDate: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="BTG Dashboard" description="KPIs de AUM, perfis, assessores e sincronização" />
      <div className="px-8">
        <BtgDashboard
          totais={{
            aumTotal: todosClientes._sum.saldo || 0,
            saldoConta: todosClientes._sum.saldoConta || 0,
            totalClientes: todosClientes._count._all,
          }}
          perClasse={perClasse.map((p) => ({
            classe: p.classificacao,
            aum: p._sum.saldo || 0,
            count: p._count._all,
          }))}
          perPerfil={perPerfil.map((p) => ({
            perfil: p.perfilInvestidor || "não-cadastrado",
            count: p._count._all,
          }))}
          perAssessor={perAssessor.map((p) => ({
            nome: p.assessorNome || "sem assessor",
            count: p._count._all,
            aum: p._sum.saldo || 0,
          }))}
          ultimoImport={ultimoImport ? JSON.parse(JSON.stringify(ultimoImport)) : null}
          ultimoMovs={ultimoMovs ? JSON.parse(JSON.stringify(ultimoMovs)) : null}
          movs7d={movs7d}
          movsPorTipo={movsPorTipo.map((m) => ({
            tipo: m.tipo,
            count: m._count._all,
            valorTotal: m._sum.valor || 0,
          }))}
          posicaoMaisAntiga={posicaoMaisAntiga ? JSON.parse(JSON.stringify(posicaoMaisAntiga)) : null}
        />
      </div>
    </div>
  );
}
