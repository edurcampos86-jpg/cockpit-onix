export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { PageHeader } from "@/components/layout/page-header";
import { ClientesTable } from "@/components/backoffice/clientes-table";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_CLASSIFICACAO_ABC } from "@/lib/backoffice/referencias";

export default async function ClientesPage() {
  const session = await getSession();
  const isAdmin = session?.role === "admin";

  let clientes: Array<{
    id: string;
    nome: string;
    numeroConta: string;
    saldo: number;
    saldoConta: number;
    classificacao: string;
    classificacaoManual: boolean;
    email: string | null;
    telefone: string | null;
    profissao: string | null;
    nicho: string | null;
    ultimoContatoAt: Date | null;
    ultimaReuniaoAt: Date | null;
    proximaReuniaoAt: Date | null;
    proximoContatoAt: Date | null;
    receitaAnual: number;
    assessorNome: string | null;
    assessorCge: string | null;
    assessorEmail: string | null;
    pendenciaCadastral: string | null;
    aniversario: Date | null;
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
      saldoConta: c.saldoConta,
      classificacao: c.classificacao,
      classificacaoManual: c.classificacaoManual,
      email: c.email,
      telefone: c.telefone,
      profissao: c.profissao,
      nicho: c.nicho,
      ultimoContatoAt: c.ultimoContatoAt,
      ultimaReuniaoAt: c.ultimaReuniaoAt,
      proximaReuniaoAt: c.proximaReuniaoAt,
      proximoContatoAt: c.proximoContatoAt,
      receitaAnual: c.receitaAnual,
      assessorNome: c.assessorNome,
      assessorCge: c.assessorCge,
      assessorEmail: c.assessorEmail,
      pendenciaCadastral: c.pendenciaCadastral,
      aniversario: c.aniversario,
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
        <ComoFunciona
          proposito="Sua base completa de clientes segmentada em A, B e C — com saldo, receita, contatos e próximas ações."
          comoUsar="Filtre por classe, assessor ou cadência; ordene por qualquer coluna; use os badges 12-4-2 para identificar A fora de prazo."
          comoAjuda="Garante que você invista o tempo certo em cada perfil — sem deixar um A esquecido nem desperdiçar horas em C."
        />
        <ReferenciaLivro
          referencias={REF_CLASSIFICACAO_ABC}
          titulo="Por que classificar clientes em A, B e C?"
        />

        <ClientesTable clientes={clientes} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
