export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { GruposClientesPanel } from "@/components/backoffice/grupos-clientes-panel";

export default async function GruposPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/backoffice");

  // Carrega TODOS clientes pro dropdown (lado client filtra por busca textual).
  const clientes = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true, numeroConta: true, assessorNome: true },
    orderBy: { nome: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Grupos WhatsApp — Vincular a clientes"
        description="Datacrazy não expõe quem enviou cada mensagem em grupo. Vincule manualmente os grupos relevantes a um cliente — o sistema passa a atualizar 'Último contato' do cliente toda vez que houver mensagem nova no grupo."
      />
      <div className="px-8">
        <ComoFunciona
          proposito="Vincular grupos do WhatsApp (via Datacrazy) ao cliente correto, já que a API não revela quem mandou cada mensagem em grupo."
          comoUsar="Para cada grupo onde você fala com um cliente específico, escolha o cliente no dropdown e salve o vínculo. Faça uma vez — depois é automático."
          comoAjuda="Mantém o 'Último contato' do cliente atualizado sempre que houver mensagem nova no grupo dele, alimentando a cadência 12-4-2."
        />
      </div>
      <div className="px-8">
        <GruposClientesPanel clientes={clientes} />
      </div>
    </div>
  );
}
