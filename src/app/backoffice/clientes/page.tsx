export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ClientesTable } from "@/components/backoffice/clientes-table";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { REF_CLASSIFICACAO_ABC } from "@/lib/backoffice/referencias";

export default async function ClientesPage() {
  let clientes: Array<{
    id: string;
    nome: string;
    numeroConta: string;
    saldo: number;
    classificacao: string;
    classificacaoManual: boolean;
    email: string | null;
    telefone: string | null;
    profissao: string | null;
    nicho: string | null;
    ultimoContatoAt: Date | null;
    proximoContatoAt: Date | null;
    receitaAnual: number;
  }> = [];

  try {
    const raw = await prisma.clienteBackoffice.findMany({
      orderBy: [{ classificacao: "asc" }, { saldo: "desc" }],
    });
    clientes = raw.map((c) => ({
      id: c.id,
      nome: c.nome,
      numeroConta: c.numeroConta,
      saldo: c.saldo,
      classificacao: c.classificacao,
      classificacaoManual: c.classificacaoManual,
      email: c.email,
      telefone: c.telefone,
      profissao: c.profissao,
      nicho: c.nicho,
      ultimoContatoAt: c.ultimoContatoAt,
      proximoContatoAt: c.proximoContatoAt,
      receitaAnual: c.receitaAnual,
    }));
  } catch {
    // tabela pode não existir ainda
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes — Classificação ABC"
        description="Segmentação Supernova: foco nos clientes A, disciplina nos B, eficiência nos C."
      />

      <div className="px-8 space-y-6">
        <ReferenciaLivro
          referencias={REF_CLASSIFICACAO_ABC}
          titulo="Por que classificar clientes em A, B e C?"
        />

        <ClientesTable clientes={clientes} />
      </div>
    </div>
  );
}
