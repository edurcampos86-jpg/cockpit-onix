// Sem cache em nenhuma camada — a tabela de clientes precisa refletir
// o estado atual do banco (ultimoContatoAt, telefones, etc.) imediatamente
// após imports/syncs. `dynamic = "force-dynamic"` sozinho não foi
// suficiente — havia sinal de cache no edge servindo dados antigos.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { prisma } from "@/lib/prisma";
import { isAdmin as ehAdmin, isAdminMaster as souMaster } from "@/lib/rbac-papeis";
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
import { TIPOS_QUE_CONTAM_TOQUE, inicioJanelaToques } from "@/lib/cadencia-core";
import { getAuthContext } from "@/lib/auth-helpers";

export default async function ClientesPage() {
  noStore();
  // Toca os headers da request pra evitar qualquer cache estático
  await headers();
  const session = await getSession();
  /* O Admin Master tem `role` "master" e precisa passar aqui também. `pessoa: null`
   * porque este caminho só tem o JWT, que não carrega `teamRole`. */
  const isAdmin = session ? ehAdmin({ role: session.role, pessoa: null }) : false;
  /* Exportar a base é poder de Admin Master. O JWT não carrega e-mail, então o
   * fallback de bootstrap não alcança aqui — quem for master pelo e-mail e ainda
   * não tiver `role` "master" no banco não verá o botão até o UPDATE rodar. É o
   * lado seguro do erro: esconde demais, nunca exporta demais. */
  const ehAdminMaster = session ? souMaster({ role: session.role, pessoa: null }) : false;

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
    // Procedência gravada pelo recompute (lib/reunioes.ts) — vira badge de
    // fonte + selo de confirmação manual na tabela.
    ultimaReuniaoSource: string | null;
    ultimaReuniaoConfirmadaManualmente: boolean;
    proximaReuniaoSource: string | null;
    proximaReuniaoConfirmadaManualmente: boolean;
    // Teto de reunião só deste cliente; null = régua da classe.
    cadenciaReuniaoDiasOverride: number | null;
    cadenciaReuniaoEditadoEm: Date | null;
    // Nome de quem definiu o teto manual (o banco guarda só o userId).
    cadenciaReuniaoEditadoPorNome: string | null;
    proximoContatoAt: Date | null;
    /** Toques (ligação + reunião) nos últimos 12 meses — numerador do 12-4-2. */
    toquesNoAno: number;
    receitaAnual: number;
    feeFixo: boolean;
    feeFixoEditadoEm: Date | null;
    // Nome resolvido de quem alternou o fee (o banco guarda só o userId).
    // null = nunca alternado, ou usuário removido desde então.
    feeFixoEditadoPorNome: string | null;
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

    // Os dois rastros guardam userId (String, sem relation). Resolve os nomes
    // de AMBOS numa query só, e SÓ quando existe alguém pra resolver — base sem
    // fee marcado e sem teto manual não paga nada por isso. Incluir o editor do
    // teto aqui é o que evita o tooltip mostrar "por null" para quem editou só
    // o teto.
    const editorIds = [
      ...new Set(
        raw
          .flatMap((c) => [c.feeFixoEditadoPor, c.cadenciaReuniaoEditadoPor])
          .filter((v): v is string => !!v),
      ),
    ];
    const nomePorUserId = new Map<string, string>();
    if (editorIds.length > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: editorIds } },
        select: { id: true, name: true },
      });
      for (const u of users) nomePorUserId.set(u.id, u.name);
    }

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
      ultimaReuniaoSource: c.ultimaReuniaoSource,
      ultimaReuniaoConfirmadaManualmente: c.ultimaReuniaoConfirmadaManualmente,
      proximaReuniaoSource: c.proximaReuniaoSource,
      proximaReuniaoConfirmadaManualmente: c.proximaReuniaoConfirmadaManualmente,
      cadenciaReuniaoDiasOverride: c.cadenciaReuniaoDiasOverride,
      cadenciaReuniaoEditadoEm: c.cadenciaReuniaoEditadoEm,
      cadenciaReuniaoEditadoPorNome: c.cadenciaReuniaoEditadoPor
        ? (nomePorUserId.get(c.cadenciaReuniaoEditadoPor) ?? null)
        : null,
      proximoContatoAt: c.proximoContatoAt,
      // Preenchido logo abaixo pela agregação; 0 é o default honesto para quem
      // não tiver nenhuma interação na janela.
      toquesNoAno: 0,
      receitaAnual: c.receitaAnual,
      feeFixo: c.feeFixo,
      feeFixoEditadoEm: c.feeFixoEditadoEm,
      feeFixoEditadoPorNome: c.feeFixoEditadoPor
        ? (nomePorUserId.get(c.feeFixoEditadoPor) ?? null)
        : null,
      assessorNome: c.assessorNome,
      assessorCge: c.assessorCge,
      assessorEmail: c.assessorEmail,
      pendenciaCadastral: c.pendenciaCadastral,
      aniversario: c.aniversario,
    }));
  } catch {
    // tabela pode não existir ainda
  }

  // Toques do último ano, por cliente — o numerador da cadência 12-4-2.
  //
  // UMA query agregada para a página inteira, não uma por linha: a tabela lista
  // a carteira toda e uma consulta por cliente seriam centenas de idas ao banco
  // para desenhar um badge. `groupBy` devolve a contagem já somada pelo Postgres.
  //
  // Quais tipos contam é decisão de `TIPOS_QUE_CONTAM_TOQUE`, e o WHERE usa o
  // MESMO array — não uma lista repetida aqui. Duas cópias da régua divergiriam
  // no dia em que um tipo entrasse ou saísse da conta, e a tabela passaria a
  // mostrar um número que o alerta não reconhece. Foi por pouco: a lista mudou
  // uma vez (WhatsApp entrou) enquanto esta PR estava aberta.
  if (clientes.length > 0) {
    const contagens = await prisma.interacaoCliente.groupBy({
      by: ["clienteId"],
      where: {
        clienteId: { in: clientes.map((c) => c.id) },
        tipo: { in: [...TIPOS_QUE_CONTAM_TOQUE] },
        data: { gte: inicioJanelaToques() },
      },
      _count: { _all: true },
    });
    const porCliente = new Map(contagens.map((g) => [g.clienteId, g._count._all]));
    clientes = clientes.map((c) => ({ ...c, toquesNoAno: porCliente.get(c.id) ?? 0 }));
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

        <ClientesTable
          clientes={clientes}
          isAdmin={isAdmin}
          ehAdminMaster={ehAdminMaster}
          mostrarSaldoParado={mostrarSaldoParado}
          usuarioNome={session?.name ?? null}
        />
      </div>
    </div>
  );
}
