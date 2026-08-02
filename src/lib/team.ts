import "server-only";
import { prisma } from "./prisma";
import { chaveCpf, formatarCpf } from "./backoffice/cpf";
import { riscoEvasaoReuniao } from "./cadencia-core";
import { isEmailCorporativo } from "./dominios-corporativos";

/* ──────────────────────────────────────────────────────────────────────────
   CONSTANTES — espelham os "enums via string" do schema.prisma (Pessoa).
   Mantenha sincronizado com prisma/schema.prisma.
   ────────────────────────────────────────────────────────────────────────── */

export const CARGO_FAMILIAS = [
  { value: "assessor_investimentos", label: "Assessor de Investimentos" },
  { value: "socio", label: "Sócio" },
  { value: "imobiliaria", label: "Imobiliária" },
  { value: "corretora", label: "Corretora" },
  { value: "qualidade", label: "Qualidade" },
  { value: "administrativo", label: "Administrativo" },
] as const;

export const TEAM_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "lideranca", label: "Liderança" },
  { value: "colaborador", label: "Colaborador" },
] as const;

export const PESSOA_STATUS = [
  { value: "ativo", label: "Ativo" },
  { value: "arquivado", label: "Arquivado" },
] as const;

export const MOTIVOS_SAIDA = [
  { value: "demissao", label: "Demissão" },
  { value: "saida_voluntaria", label: "Saída voluntária" },
  { value: "fim_contrato", label: "Fim de contrato" },
  { value: "outro", label: "Outro" },
] as const;

export const TIPOS_ACORDO = [
  { value: "pro_labore", label: "Pró-labore (fixo mensal)" },
  { value: "split", label: "Split de receita" },
  { value: "comissao", label: "Comissão" },
  { value: "misto", label: "Misto (fixo + variável)" },
] as const;

export const CATEGORIAS_REUNIAO = [
  { value: "1_1_acompanhamento", label: "1:1 de acompanhamento" },
  { value: "feedback", label: "Feedback" },
  { value: "avaliacao", label: "Avaliação de desempenho" },
  { value: "alinhamento_metas", label: "Alinhamento de metas" },
  { value: "conversa_dificil", label: "Conversa difícil (PIP, advertência)" },
  { value: "equipe", label: "Reunião de equipe" },
  { value: "comite", label: "Comitê / governança" },
  { value: "outra", label: "Outra" },
] as const;

export type CargoFamiliaValue = (typeof CARGO_FAMILIAS)[number]["value"];
export type TeamRoleValue = (typeof TEAM_ROLES)[number]["value"];
export type PessoaStatusValue = (typeof PESSOA_STATUS)[number]["value"];
export type MotivoSaidaValue = (typeof MOTIVOS_SAIDA)[number]["value"];
export type TipoAcordoValue = (typeof TIPOS_ACORDO)[number]["value"];
export type CategoriaReuniaoValue = (typeof CATEGORIAS_REUNIAO)[number]["value"];

/**
 * Famílias de cargo que atendem cliente no BTG e, portanto, DEVEM ter
 * `codigoAssessorBtg` preenchido.
 *
 * A lista é `socio` + `assessor_investimentos`, e não só "assessor", porque é
 * o que os dados dizem: dos 12 assessores da Base BTG que constam de
 * recover-team-data.ts, os 12 estão cadastrados como `socio`. Só uma pessoa no
 * /time tem `assessor_investimentos`, e ela não aparece na Base BTG. Filtrar
 * por "assessor" acusaria justamente quem não tem carteira e deixaria passar
 * os 12 que têm.
 *
 * Fora da lista ficam imobiliária, corretora, qualidade e administrativo — que
 * não têm vínculo com o BTG e não precisam ter (confirmado pelo Eduardo). Para
 * essas, a ausência de código é o estado correto, não uma pendência.
 */
export const CARGOS_COM_VINCULO_BTG: readonly string[] = [
  "socio",
  "assessor_investimentos",
];

/** Esta pessoa deveria ter código de assessor no BTG? */
export function deveTerCodigoBtg(cargoFamilia: string | null | undefined): boolean {
  return CARGOS_COM_VINCULO_BTG.includes(cargoFamilia ?? "");
}

export function labelCargo(v: string | null | undefined): string {
  return CARGO_FAMILIAS.find((c) => c.value === v)?.label ?? "—";
}
export function labelTeamRole(v: string | null | undefined): string {
  return TEAM_ROLES.find((c) => c.value === v)?.label ?? "—";
}
export function labelStatus(v: string | null | undefined): string {
  return PESSOA_STATUS.find((c) => c.value === v)?.label ?? "—";
}
export function labelMotivoSaida(v: string | null | undefined): string {
  return MOTIVOS_SAIDA.find((c) => c.value === v)?.label ?? "—";
}
export function labelTipoAcordo(v: string | null | undefined): string {
  return TIPOS_ACORDO.find((t) => t.value === v)?.label ?? "—";
}
export function labelCategoriaReuniao(v: string | null | undefined): string {
  return CATEGORIAS_REUNIAO.find((c) => c.value === v)?.label ?? "—";
}

/* ──────────────────────────────────────────────────────────────────────────
   QUERIES — todas Server-side (chamadas em Server Components / Actions).
   ────────────────────────────────────────────────────────────────────────── */

export async function listFiliais() {
  return prisma.filial.findMany({
    orderBy: [{ isMatriz: "desc" }, { nome: "asc" }],
  });
}

export async function listDepartamentos() {
  return prisma.departamento.findMany({ orderBy: { nome: "asc" } });
}

export async function listEquipes() {
  return prisma.equipe.findMany({
    include: { departamento: { select: { id: true, nome: true } } },
    orderBy: { nome: "asc" },
  });
}

export type ListPessoasFilters = {
  status?: PessoaStatusValue | "todos";
  filialId?: string;
  departamentoId?: string;
  busca?: string;
};

export async function listPessoas(filters: ListPessoasFilters = {}) {
  const status = filters.status ?? "ativo";
  // O banco guarda CPF só em dígitos (actions/time.ts normaliza antes de
  // gravar), então comparar com o texto cru nunca casava para quem digita ou
  // cola no formato pontuado — que é o formato sugerido pelo próprio
  // placeholder do formulário. Normalizar a BUSCA fecha o par.
  const cpfBusca = chaveCpf(filters.busca);
  const linhas = await prisma.pessoa.findMany({
    where: {
      ...(status !== "todos" ? { status } : {}),
      ...(filters.filialId ? { filialId: filters.filialId } : {}),
      ...(filters.departamentoId ? { departamentoId: filters.departamentoId } : {}),
      ...(filters.busca
        ? {
            OR: [
              { nomeCompleto: { contains: filters.busca, mode: "insensitive" } },
              { apelido: { contains: filters.busca, mode: "insensitive" } },
              { email: { contains: filters.busca, mode: "insensitive" } },
              // Sem dígitos na busca não há cláusula de CPF: `contains: ""`
              // casaria com todo mundo e diluiria o filtro de texto.
              ...(cpfBusca ? [{ cpf: { contains: cpfBusca } }] : []),
            ],
          }
        : {}),
    },
    // `select`, não `include`: com include o Prisma traz TODOS os escalares da
    // Pessoa, e este resultado atravessa a fronteira server→client como payload
    // RSC. Ia junto o CPF de todo mundo, data de nascimento e `observacoes` —
    // que o próprio formulário rotula "admin only" (pessoa-form.tsx) — para uma
    // tela que mostra 6 campos.
    //
    // Ao adicionar campo aqui, o critério é: a LISTAGEM desenha isso? Se é só
    // para a ficha, o lugar é getPessoa.
    select: {
      id: true,
      nomeCompleto: true,
      apelido: true,
      fotoUrl: true,
      status: true,
      cargoFamilia: true,
      cargoTitulo: true,
      teamRole: true,
      filialId: true,
      departamentoId: true,
      codigoAssessorBtg: true, // chave da régua de cadência por assessor
      // email e telefone entram só para virar os dois booleanos abaixo — não
      // saem daqui em texto.
      email: true,
      telefone: true,
    },
    orderBy: [{ status: "asc" }, { nomeCompleto: "asc" }],
  });

  // A listagem desenha DOIS BADGES derivados de e-mail e telefone, nunca os
  // valores. Trocar por booleano aqui tira 20 e-mails e 20 telefones do payload
  // que vai para o browser, sem mudar um pixel da tela.
  return linhas.map(({ email, telefone, ...p }) => ({
    ...p,
    semTelefone: !telefone,
    emailPessoal: !isEmailCorporativo(email),
  }));
}

export async function getPessoa(id: string) {
  return prisma.pessoa.findUnique({
    where: { id },
    include: {
      filial: true,
      departamento: true,
      equipe: { include: { departamento: true } },
      lideradoPor: {
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          fotoUrl: true,
          cargoFamilia: true,
        },
      },
      lidera: {
        where: { status: "ativo" },
        select: {
          id: true,
          nomeCompleto: true,
          apelido: true,
          fotoUrl: true,
          cargoFamilia: true,
        },
        orderBy: { nomeCompleto: "asc" },
      },
      equipesLideradas: { select: { id: true, nome: true } },
      user: { select: { id: true, email: true, role: true, avatarUrl: true } },
    },
  });
}

/** Candidatos a "líder direto" — pessoas ativas com role admin ou liderança. */
export async function listLiderancaCandidates(excludeId?: string) {
  return prisma.pessoa.findMany({
    where: {
      status: "ativo",
      teamRole: { in: ["admin", "lideranca"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      nomeCompleto: true,
      apelido: true,
      cargoFamilia: true,
    },
    orderBy: { nomeCompleto: "asc" },
  });
}

/** Estatísticas para o painel de /time. */
export async function getTimeStats() {
  const [ativos, arquivados, porFilial, porDepartamento] = await Promise.all([
    prisma.pessoa.count({ where: { status: "ativo" } }),
    prisma.pessoa.count({ where: { status: "arquivado" } }),
    prisma.pessoa.groupBy({
      by: ["filialId"],
      where: { status: "ativo" },
      _count: { _all: true },
    }),
    prisma.pessoa.groupBy({
      by: ["departamentoId"],
      where: { status: "ativo" },
      _count: { _all: true },
    }),
  ]);
  return { ativos, arquivados, porFilial, porDepartamento };
}

/* ──────────────────────────────────────────────────────────────────────────
   PENDÊNCIAS DE CADASTRO
   ────────────────────────────────────────────────────────────────────────── */

/**
 * As três pendências que a listagem já marca por card, num só lugar.
 *
 * Definidas aqui, e não na página, porque a MESMA regra decide três coisas: o
 * badge no card, o contador do topo e o filtro. Duplicar a condição em três
 * lugares é como elas passam a divergir.
 *
 * `arquivado` nunca é pendência: quem saiu não vai preencher telefone nem
 * migrar e-mail. É o mesmo critério dos badges (todos checam !isArquivado).
 */
export type PendenciasCadastro = {
  semCodigoBtg: boolean;
  semTelefone: boolean;
  emailPessoal: boolean;
};

export function pendenciasDe(p: {
  status: string;
  cargoFamilia: string;
  codigoAssessorBtg: string | null;
  telefone?: string | null;
  email?: string | null;
  semTelefone?: boolean;
  emailPessoal?: boolean;
}): PendenciasCadastro {
  if (p.status === "arquivado") {
    return { semCodigoBtg: false, semTelefone: false, emailPessoal: false };
  }
  return {
    semCodigoBtg: !p.codigoAssessorBtg && deveTerCodigoBtg(p.cargoFamilia),
    // Aceita a linha já projetada por listPessoas (booleanos) ou a linha crua.
    semTelefone: p.semTelefone ?? !p.telefone,
    emailPessoal: p.emailPessoal ?? !isEmailCorporativo(p.email),
  };
}

export function temPendencia(p: Parameters<typeof pendenciasDe>[0]): boolean {
  const d = pendenciasDe(p);
  return d.semCodigoBtg || d.semTelefone || d.emailPessoal;
}

export type ResumoPendencias = {
  /** Pessoas ativas com AO MENOS uma pendência. */
  total: number;
  semCodigoBtg: number;
  semTelefone: number;
  emailPessoal: number;
};

/**
 * Pendências das pessoas ATIVAS, com a quebra por tipo.
 *
 * A quebra não é enfeite: medindo contra os 20 do recover-team-data, o total
 * deu 19 de 19 — porque 17 pessoas estão sem telefone. Um número só, nesse
 * cenário, é honesto e inútil: não diz o que fazer primeiro. Com a quebra,
 * "12 sem código BTG" salta e vira fila de trabalho.
 *
 * Independente dos filtros da tela de propósito: é indicador de saneamento
 * ("andou desde ontem?"), não recorte do que está à vista. Um número que muda
 * ao filtrar por filial não serve para acompanhar progresso.
 *
 * `emailPessoal` depende de casar domínio, o que não se expressa em SQL — daí
 * a contagem em memória. São ~20 linhas de 5 colunas; se o time passar de
 * algumas centenas, vira agregação com as duas condições SQL-áveis primeiro.
 */
export async function contarPendenciasCadastro(): Promise<ResumoPendencias> {
  const ativos = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    select: { status: true, cargoFamilia: true, codigoAssessorBtg: true, telefone: true, email: true },
  });

  const resumo: ResumoPendencias = {
    total: 0,
    semCodigoBtg: 0,
    semTelefone: 0,
    emailPessoal: 0,
  };
  for (const p of ativos) {
    const d = pendenciasDe(p);
    if (d.semCodigoBtg) resumo.semCodigoBtg++;
    if (d.semTelefone) resumo.semTelefone++;
    if (d.emailPessoal) resumo.emailPessoal++;
    if (d.semCodigoBtg || d.semTelefone || d.emailPessoal) resumo.total++;
  }
  return resumo;
}

/* ──────────────────────────────────────────────────────────────────────────
   CARTEIRA BTG — leitura pelo código do assessor
   ────────────────────────────────────────────────────────────────────────── */

export type CarteiraBtg = {
  clientes: number;
  pl: number;
  ticketMedio: number;
  porClasse: { A: number; B: number; C: number };
  semReuniaoAgendada: number;
};

/**
 * Carteira de uma pessoa a partir do código dela no BTG.
 *
 * O casamento é por VALOR entre `Pessoa.codigoAssessorBtg` e
 * `ClienteBackoffice.assessorCge` — sem FK, mesma convenção já usada por
 * `CarteiraCge.cge` e pelo scoping de RBAC (src/lib/rbac.ts). `assessorCge` é
 * indexado (schema.prisma, @@index([assessorCge])), então isto é uma leitura
 * barata mesmo com a base inteira.
 *
 * `semReuniaoAgendada` fica junto de propósito: é o número que transforma a
 * ficha de cadastro em ferramenta de gestão. "Tem 141 clientes" é dado; "tem
 * 141 clientes e 38 sem próxima reunião marcada" é uma conversa de 1:1.
 */
export async function getCarteiraBtg(
  codigoAssessorBtg: string | null | undefined,
): Promise<CarteiraBtg | null> {
  const cge = (codigoAssessorBtg ?? "").trim();
  if (!cge) return null;

  const where = { assessorCge: cge };

  const [agregado, porClasse, semReuniao] = await Promise.all([
    prisma.clienteBackoffice.aggregate({
      where,
      _count: { _all: true },
      _sum: { saldo: true },
    }),
    prisma.clienteBackoffice.groupBy({
      by: ["classificacao"],
      where,
      _count: { _all: true },
    }),
    prisma.clienteBackoffice.count({
      where: { ...where, proximaReuniaoAt: null },
    }),
  ]);

  const clientes = agregado._count._all;
  if (clientes === 0) return null;

  const pl = agregado._sum.saldo ?? 0;
  const classe = { A: 0, B: 0, C: 0 };
  for (const linha of porClasse) {
    const k = linha.classificacao as "A" | "B" | "C";
    if (k in classe) classe[k] = linha._count._all;
  }

  return {
    clientes,
    pl,
    ticketMedio: pl / clientes,
    porClasse: classe,
    semReuniaoAgendada: semReuniao,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   CADÊNCIA DE REUNIÃO POR ASSESSOR
   ────────────────────────────────────────────────────────────────────────── */

export type CadenciaCarteira = {
  clientes: number;
  ok: number;
  atencao: number;
  risco: number;
};

/**
 * Saúde da régua de reunião de cada carteira, em UMA query.
 *
 * A régua (A 90d · B 120d · C 180d, com override manual por cliente) já existe
 * em ../cadencia-core e já aparece por CLIENTE — na tabela de clientes e no
 * banner do dashboard. O que não existia era o corte por ASSESSOR: quem está
 * deixando a própria carteira envelhecer. Sem isso, "todo cliente com reunião
 * agendada" é uma meta sem dono.
 *
 * Uma query só, com `in`, e a avaliação em memória: `riscoEvasaoReuniao` compara
 * a data da ÚLTIMA reunião com o teto da classe, o que não se expressa em
 * groupBy. São 4 colunas pequenas por cliente, filtradas por `assessorCge`
 * (indexado, schema.prisma:769).
 *
 * `agora` é fixado uma vez para a página inteira: se cada cliente chamasse
 * Date.now(), dois clientes na fronteira do prazo poderiam cair em lados
 * diferentes na mesma renderização.
 */
export async function getCadenciaReuniaoPorAssessor(
  codigos: Array<string | null | undefined>,
): Promise<Map<string, CadenciaCarteira>> {
  const lista = [...new Set(codigos.filter((c): c is string => !!c))];
  const mapa = new Map<string, CadenciaCarteira>();
  if (lista.length === 0) return mapa;

  const clientes = await prisma.clienteBackoffice.findMany({
    where: { assessorCge: { in: lista } },
    select: {
      assessorCge: true,
      classificacao: true,
      ultimaReuniaoAt: true,
      proximaReuniaoAt: true,
      cadenciaReuniaoDiasOverride: true,
    },
  });

  const agora = Date.now();
  for (const c of clientes) {
    if (!c.assessorCge) continue;
    const atual = mapa.get(c.assessorCge) ?? { clientes: 0, ok: 0, atencao: 0, risco: 0 };
    atual.clientes++;
    const r = riscoEvasaoReuniao(
      c.classificacao,
      c.ultimaReuniaoAt,
      c.proximaReuniaoAt,
      c.cadenciaReuniaoDiasOverride,
      agora,
    );
    atual[r.status]++;
    mapa.set(c.assessorCge, atual);
  }
  return mapa;
}

/* ──────────────────────────────────────────────────────────────────────────
   UTILS
   ────────────────────────────────────────────────────────────────────────── */

export function pessoaIniciais(nomeCompleto: string): string {
  const parts = nomeCompleto.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Mantido como reexport: a implementação mudou de casa para ./backoffice/cpf,
 * que é puro e pode ser importado por client component (team.ts é
 * `server-only`). O nome fica para não mexer nos chamadores.
 */
export function formatCpf(cpf: string): string {
  return formatarCpf(cpf);
}
