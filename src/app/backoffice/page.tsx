export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { DadosUpload } from "@/components/backoffice/dados-upload";
import { DashboardSupernova } from "@/components/backoffice/dashboard-supernova";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { REF_PROMESSA_SERVICO, REF_CLIENTES_ORFAOS } from "@/lib/backoffice/referencias";

export default async function BackofficePage() {
  let clientes: { id: string; nome: string; numeroConta: string; saldo: number }[] = [];
  let total = 0;

  try {
    const raw = await prisma.clienteBackoffice.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, numeroConta: true, saldo: true },
    });
    clientes = raw;
    total = raw.length;
  } catch {
    // Table may not exist yet
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backoffice — Assessoria Supernova"
        description="Método 12-4-2 para gestão excepcional de clientes"
      />

      <div className="px-8 space-y-6">
        <ReferenciaLivro
          referencias={[...REF_PROMESSA_SERVICO, ...REF_CLIENTES_ORFAOS]}
          titulo="A Promessa de Serviço Supernova"
        />

        <DashboardSupernova />

        <DadosUpload initialClientes={clientes} initialTotal={total} />
      </div>
    </div>
  );
}
