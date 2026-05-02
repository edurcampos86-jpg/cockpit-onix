export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ClienteDetalhe } from "@/components/backoffice/cliente-detalhe";
import { ClienteBtgSection } from "@/components/backoffice/cliente-btg-section";

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
      },
    }),
    prisma.movimentacaoBtg.findMany({
      where: { clienteId: id },
      orderBy: { data: "desc" },
      take: 30,
    }),
  ]);

  if (!cliente) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={cliente.nome}
        description={`Conta ${cliente.numeroConta} · Classe ${cliente.classificacao}`}
      />
      <div className="px-8 space-y-6">
        <Link
          href="/backoffice/clientes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para lista de clientes
        </Link>
        <ClienteBtgSection
          cliente={JSON.parse(JSON.stringify(cliente))}
          movimentacoes={JSON.parse(JSON.stringify(movimentacoes))}
        />
        <ClienteDetalhe cliente={JSON.parse(JSON.stringify(cliente))} />
      </div>
    </div>
  );
}
