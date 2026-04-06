export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { DadosUpload } from "@/components/backoffice/dados-upload";

export default async function BackofficePage() {
  let clientes: { id: string; nome: string; numeroConta: string; saldo: number }[] = [];
  let total = 0;

  try {
    clientes = await prisma.clienteBackoffice.findMany({
      orderBy: { nome: "asc" },
    });
    total = clientes.length;
  } catch {
    // Table may not exist yet
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backoffice"
        description="Painel administrativo"
      />

      <div className="px-8">
        <DadosUpload initialClientes={clientes} initialTotal={total} />
      </div>
    </div>
  );
}
