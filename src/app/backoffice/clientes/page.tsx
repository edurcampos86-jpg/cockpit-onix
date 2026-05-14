export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { ClientesTable } from "@/components/backoffice/clientes-table";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { REF_CLASSIFICACAO_ABC } from "@/lib/backoffice/referencias";

export default async function ClientesPage() {
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
    proximoContatoAt: Date | null;
    ultimaReuniaoAt: Date | null;
    proximaReuniaoAt: Date | null;
    ultimaReuniaoFonte: string | null;
    proximaReuniaoFonte: string | null;
    receitaAnual: number;
    assessorId: string | null;
  }> = [];

  let assessores: Array<{ id: string; nomeCompleto: string; apelido: string | null }> = [];

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
      proximoContatoAt: c.proximoContatoAt,
      ultimaReuniaoAt: c.ultimaReuniaoAt,
      proximaReuniaoAt: c.proximaReuniaoAt,
      ultimaReuniaoFonte: c.ultimaReuniaoFonte,
      proximaReuniaoFonte: c.proximaReuniaoFonte,
      receitaAnual: c.receitaAnual,
      assessorId: c.assessorId,
    }));
  } catch {
    // tabela pode não existir ainda
  }

  try {
    assessores = await prisma.pessoa.findMany({
      where: { cargoFamilia: "assessor_investimentos", status: "ativo" },
      select: { id: true, nomeCompleto: true, apelido: true },
      orderBy: { nomeCompleto: "asc" },
    });
  } catch {
    // Pessoa pode não existir ainda
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
          comoUsar="Filtre por classe ou assessor, ordene por qualquer coluna, e use os badges 12-4-2 para identificar clientes fora de cadência."
          comoAjuda="Garante que você invista o tempo certo em cada perfil — sem deixar um A esquecido nem desperdiçar horas em C."
        />
        <ReferenciaLivro
          referencias={REF_CLASSIFICACAO_ABC}
          titulo="Por que classificar clientes em A, B e C?"
        />

        <ClientesTable clientes={clientes} assessores={assessores} />
      </div>
    </div>
  );
}
