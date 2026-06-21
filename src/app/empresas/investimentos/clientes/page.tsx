// Sem cache em nenhuma camada — a tabela de clientes precisa refletir
// o estado atual do banco (ultimoContatoAt, telefones, etc.) imediatamente
// após imports/syncs. `dynamic = "force-dynamic"` sozinho não foi
// suficiente — havia sinal de cache no edge servindo dados antigos.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { PageHeader } from "@/components/layout/page-header";
import { ClientesTable } from "@/components/backoffice/clientes-table";
import { ReferenciaLivro } from "@/components/backoffice/referencia-livro";
import { ComoFunciona } from "@/components/backoffice/como-funciona";
import { BuscaInteligente } from "@/components/backoffice/busca-inteligente";
import { REF_CLASSIFICACAO_ABC } from "@/lib/backoffice/referencias";
import {
  atencaoInlineHabilitado,
  derivarDatasDirecionais,
  resolverLimiarVacuoDias,
} from "@/lib/painel-atencao/service";
import { saldoParadoDiasHabilitado } from "@/lib/backoffice/saldo-parado-flag";
import {
  classificarEstadoAtencao,
  type EstadoAtencao,
} from "@/lib/painel-atencao/core";
import { rbacEnforcementHabilitado, resolverCgesVisiveis } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

export default async function ClientesPage() {
  noStore();
  // Toca os headers da request pra evitar qualquer cache estático
  await headers();
  const session = await getSession();
  const isAdmin = session?.role === "admin";

  // RBAC — Camada 1 (escopo). Flag RBAC_ENFORCEMENT (default OFF). OFF => where
  // vazio (comportamento atual). ON => filtra pela carteira do usuário, exceto
  // quando resolverCgesVisiveis devolve null (sem filtro: admin, sem papel,
  // escopo "todas", ou config incompleta — postura não-disruptiva).
  const where: { assessorCge?: { in: string[] } } = {};
  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    const cges = await resolverCgesVisiveis(ctx);
    if (cges) where.assessorCge = { in: cges };
  }

  let clientes: Array<{
    id: string;
    nome: string;
    nomeCompleto: string | null;
    apelido: string | null;
    numeroConta: string;
    saldo: number;
    saldoConta: number;
    saldoContaDesde: Date | null;
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
    // Enriquecimento OPCIONAL da fusão inline de atenção (flag CLIENTES_ATENCAO_INLINE).
    // Flag OFF → nunca preenchidos → undefined → render da coluna Presença idêntico.
    ultimaMensagemMinhaEm?: Date | null;
    ultimaMensagemClienteEm?: Date | null;
    estado?: EstadoAtencao;
  }> = [];

  try {
    const raw = await prisma.clienteBackoffice.findMany({
      where,
      orderBy: [{ classificacao: "asc" }, { saldo: "desc" }],
    });
    clientes = raw.map((c) => ({
      id: c.id,
      nome: c.nome,
      nomeCompleto: c.nomeCompleto,
      apelido: c.apelido,
      numeroConta: c.numeroConta,
      saldo: c.saldo,
      saldoConta: c.saldoConta,
      saldoContaDesde: c.saldoContaDesde,
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

  // Fusão inline do sinal direcional de atenção na coluna Presença, ATRÁS DE FLAG
  // (default OFF). OFF → este bloco não roda → zero query extra, os 3 campos
  // chegam undefined e o selo é byte-idêntico ao de hoje (invariante de
  // `selarPresenca`). ON → enriquece em memória, sem coluna nova e sem migration.
  if (await atencaoInlineHabilitado()) {
    const datas = await derivarDatasDirecionais(clientes.map((c) => c.id));
    const limiar = await resolverLimiarVacuoDias();
    clientes = clientes.map((c) => {
      const d = datas.get(c.id);
      const eu = d?.eu ?? null;
      const cli = d?.cliente ?? null;
      // `now` omitido de propósito: classificarEstadoAtencao usa `?? Date.now()`
      // internamente (lib, fora da regra react-hooks/purity); granularidade de
      // dias torna a diferença sub-ms entre clientes irrelevante.
      const { estado } = classificarEstadoAtencao({
        ultimoEuFalei: eu,
        ultimoClienteFalou: cli,
        classificacao: c.classificacao,
        limiarVacuoDias: limiar,
      });
      return {
        ...c,
        ultimaMensagemMinhaEm: eu,
        ultimaMensagemClienteEm: cli,
        estado,
      };
    });
  }

  // Gate da UI "parado há X dias" (default OFF). Propagar saldoContaDesde acima
  // é de graça (já vinha do findMany); a flag gateia só a exibição/ordenação.
  // OFF → mostrarSaldoParado=false → coluna Saldo Conta byte-idêntica à de hoje.
  const mostrarSaldoParado = await saldoParadoDiasHabilitado();

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

        {isAdmin && <BuscaInteligente />}

        <ReferenciaLivro
          referencias={REF_CLASSIFICACAO_ABC}
          titulo="Por que classificar clientes em A, B e C?"
        />

        <ClientesTable clientes={clientes} isAdmin={isAdmin} mostrarSaldoParado={mostrarSaldoParado} />
      </div>
    </div>
  );
}
