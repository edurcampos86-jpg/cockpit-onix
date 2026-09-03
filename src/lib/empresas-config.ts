/* ──────────────────────────────────────────────────────────────
 * Config tipada das "empresas" do ecossistema (shell de abas).
 * Fase 2: piloto só com "investimentos", reusando páginas /backoffice
 * que JÁ existem. `icon` é o nome de um ícone lucide-react, resolvido
 * pelo EmpresaShell. `emBreve` = aba desabilitada (sem href).
 * ────────────────────────────────────────────────────────────── */

export type AbaEmpresa = {
  label: string;
  icon: string;
  href?: string;
  emBreve?: boolean;
  /**
   * Aba que só aparece para admin.
   *
   * Gate COSMÉTICO, como o da sidebar: quem esconde de verdade é a página
   * (`/empresas/corretora/importar` responde `notFound()` para não-admin) e a
   * rota (`guardAdminApi`). Aqui é para não oferecer a quem não pode usar.
   */
  soAdmin?: boolean;
};

export type EmpresaConfig = {
  id: string;
  nome: string;
  abas: AbaEmpresa[];
};

/* O `id` "investimentos" é a chave gravada em Implementacao.empresaId desde o
 * início e NÃO muda — só o rótulo passou a ser "Onix Capital". Renomear o id
 * exigiria um UPDATE em massa nas linhas existentes sem ganho nenhum: o id é
 * interno, o nome é o que aparece na tela. Mesma lógica em "imobiliaria". */
const investimentos: EmpresaConfig = {
  id: "investimentos",
  nome: "Onix Capital",
  abas: [
    { label: "Onboard", icon: "UserPlus", emBreve: true },
    { label: "Rotina", icon: "CalendarCheck", href: "/empresas/investimentos/painel-do-dia" },
    { label: "KPIs", icon: "Gauge", href: "/empresas/investimentos/performance" },
    { label: "Cliente Onix Capital", icon: "Handshake", href: "/empresas/investimentos/clientes" },
    { label: "Receita", icon: "DollarSign", href: "/empresas/investimentos/receita" },
    { label: "Treinamento", icon: "GraduationCap", href: "/empresas/investimentos/storyselling" },
    { label: "Time/Pessoas", icon: "UsersRound", emBreve: true },
    { label: "Melhorias", icon: "Sparkles", href: "/configuracoes/implementacoes/nova?empresa=investimentos" },
    // ── Núcleo cliente ──
    { label: "BTG", icon: "Building2", href: "/empresas/investimentos/btg" },
    { label: "Cadência", icon: "Repeat", href: "/empresas/investimentos/cadencia" },
    { label: "Indicações", icon: "Share2", href: "/empresas/investimentos/indicacoes" },
    { label: "Grupos", icon: "Boxes", href: "/empresas/investimentos/grupos" },
  ],
};

/* ──────────────────────────────────────────────────────────────
 * F4 — shells das demais empresas do grupo. Mesmo template de abas
 * do piloto investimentos; abas de conteúdo apontam pra placeholders
 * em /empresas/<slug>/* até cada uma ganhar recheio próprio.
 * "Melhorias" reusa a central de Implementações (?empresa=<id>).
 * ────────────────────────────────────────────────────────────── */

function abasPadrao(slug: string): AbaEmpresa[] {
  return [
    { label: "Onboard", icon: "UserPlus", emBreve: true },
    { label: "Rotina", icon: "CalendarCheck", href: `/empresas/${slug}/rotina` },
    { label: "KPIs", icon: "Gauge", href: `/empresas/${slug}/kpis` },
    { label: "Negócios", icon: "Handshake", href: `/empresas/${slug}/negocios` },
    /* "Receita", NÃO "ROI" — e a diferença não é preferência de palavra.
     *
     * ROI compara retorno com INVESTIMENTO, e o sistema não tem despesa: um
     * `grep` por despesa/custo no schema devolve zero. A aba só sabe o
     * numerador, e um rótulo que promete a divisão inteira é a mesma classe
     * de erro do KPI "Receita anual", que mostrava a renda declarada do
     * cliente e foi corrigido na #414.
     *
     * A rota acompanha o rótulo (`/receita`, não `/roi`): senão o endereço
     * segue dizendo ROI e quem for construir a tela de verdade cai numa pasta
     * com o nome errado.
     *
     * O rótulo volta a ser ROI quando `LancamentoDespesa` tiver dado —
     * `docs/onix-financeiro-modelo.md`, seção 6. */
    { label: "Receita", icon: "DollarSign", href: `/empresas/${slug}/receita` },
    { label: "Treinamento", icon: "GraduationCap", href: `/empresas/${slug}/treinamento` },
    { label: "Time/Pessoas", icon: "UsersRound", emBreve: true },
    { label: "Melhorias", icon: "Sparkles", href: `/configuracoes/implementacoes/nova?empresa=${slug}` },
  ];
}

const corretora: EmpresaConfig = {
  id: "corretora",
  nome: "Onix Corretora",
  abas: [
    ...abasPadrao("corretora"),
    // Só a Corretora tem esta aba: é a única empresa com motor de importação
    // de contratos. Sem ela, a tela existe e só é alcançável digitando a URL —
    // e ela é hoje o único caminho de entrada de dados da Corretora.
    {
      label: "Importar relatório",
      icon: "Upload",
      href: "/empresas/corretora/importar",
      soAdmin: true,
    },
  ],
};

const planejamento: EmpresaConfig = {
  id: "planejamento",
  nome: "Planejamento Patrimonial",
  abas: abasPadrao("planejamento"),
};

const imobiliaria: EmpresaConfig = {
  id: "imobiliaria",
  nome: "Onix Imob",
  abas: abasPadrao("imobiliaria"),
};

const educacao: EmpresaConfig = {
  id: "educacao",
  nome: "Onix Educação",
  abas: abasPadrao("educacao"),
};

const corporate: EmpresaConfig = {
  id: "corporate",
  nome: "Onix Corporate",
  abas: abasPadrao("corporate"),
};

const tech: EmpresaConfig = {
  id: "tech",
  nome: "Onix Tech",
  abas: abasPadrao("tech"),
};

/* Com a flag desligada, EMPRESAS fica idêntico ao estado pré-F4 —
 * as empresas novas não aparecem nem no select de Implementações. */
const NAV_V2 = process.env.NEXT_PUBLIC_NAV_V2 === "true";

export const EMPRESAS: EmpresaConfig[] = NAV_V2
  ? [investimentos, corretora, planejamento, imobiliaria, corporate, tech]
  : [investimentos];

/* ──────────────────────────────────────────────────────────────
 * Alvos da Central de Implementações — fase inicial.
 *
 * Lista PRÓPRIA, separada de EMPRESAS de propósito, por dois motivos:
 *
 * 1. EMPRESAS depende de NEXT_PUBLIC_NAV_V2. Com a flag desligada ela colapsa
 *    para [investimentos] — e o seletor de "Nova implementação" ficava com uma
 *    empresa só. A fila de melhorias não tem por que esperar o rollout da
 *    navegação: quem tem ideia para a Corretora tem hoje, com a flag off.
 * 2. EMPRESAS é a config de NAVEGAÇÃO (abas, rotas, shell). "planejamento" e
 *    "corporate" seguem lá porque têm rotas em /empresas/* que continuam
 *    funcionando; só não são alvo de sugestão nova nesta fase.
 *
 * As abas aqui são irrelevantes — esta lista só alimenta seletor e filtro.
 * ────────────────────────────────────────────────────────────── */
export const EMPRESAS_IMPLEMENTACOES: EmpresaConfig[] = [
  investimentos,
  corretora,
  imobiliaria,
  educacao,
  tech,
];

/** Todas as configs conhecidas, independente de flag ou de fase. */
const TODAS: EmpresaConfig[] = [
  investimentos,
  corretora,
  planejamento,
  imobiliaria,
  corporate,
  tech,
  educacao,
];

/**
 * Rótulo de uma empresa a partir do id gravado no banco.
 *
 * Resolve contra TODAS (não contra EMPRESAS), então empresa fora da fase
 * inicial — ou escondida pela flag de navegação — ainda aparece com nome de
 * gente. O fallback para o próprio id existe só para dado inesperado: melhor
 * mostrar "corporate" do que uma célula vazia.
 */
export function nomeEmpresa(id: string): string {
  return TODAS.find((e) => e.id === id)?.nome ?? id;
}

/** Um id é alvo válido para criar sugestão nova nesta fase? */
export function empresaAceitaImplementacao(id: string): boolean {
  return EMPRESAS_IMPLEMENTACOES.some((e) => e.id === id);
}

/**
 * Opções do filtro de empresa da Central de Implementações: a fase inicial MAIS
 * qualquer empresaId que exista de fato no banco.
 *
 * Sem a união, uma sugestão gravada para uma empresa fora da lista (histórico,
 * empresa despromovida de fase, flag de nav mudando debaixo do dado) continua
 * ocupando linha na tabela mas some do dropdown — e o filtro passa a mentir:
 * "todas" mostra um conjunto que nenhuma opção individual consegue reproduzir.
 * O extra aparece marcado para deixar claro que não é alvo de sugestão nova.
 */
export function opcoesFiltroEmpresa(
  idsPresentes: readonly string[],
): { id: string; nome: string }[] {
  const daFase = EMPRESAS_IMPLEMENTACOES.map((e) => ({ id: e.id, nome: e.nome }));
  const jaListados = new Set(daFase.map((e) => e.id));

  const extras = [...new Set(idsPresentes)]
    .filter((id) => !jaListados.has(id))
    .sort()
    .map((id) => ({ id, nome: `${nomeEmpresa(id)} (fora da fase)` }));

  return [...daFase, ...extras];
}
