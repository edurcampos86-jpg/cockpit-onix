export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { ClienteDetalhe } from "@/components/backoffice/cliente-detalhe";

export default async function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id },
    include: {
      perfilDescoberta: true,
      planoUmaPagina: true,
      checklist: true,
      metas: { orderBy: { criadoEm: "desc" } },
      eventosVida: { orderBy: { data: "asc" } },
      interacoes: { orderBy: { data: "desc" }, take: 50 },
    },
  });

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
        <ComoFunciona
          proposito="Ficha completa do cliente: perfil de descoberta, plano de uma página, checklist 12-4-2, metas, eventos de vida e histórico de interações."
          comoUsar="Atualize o checklist 12-4-2 conforme avança no relacionamento. Registre cada contato em Interações pra alimentar a cadência. Use Eventos de Vida pra capturar gatilhos (aniversário, casamento, reforma) que viram pretexto pra recontato."
          comoAjuda="Memória institucional do cliente. Qualquer pessoa do time consegue retomar o atendimento sem reler tudo, e nada cai por esquecimento — a cadência avisa antes de o cliente esfriar."
        />
        <ClienteDetalhe cliente={JSON.parse(JSON.stringify(cliente))} />
      </div>
    </div>
  );
}
