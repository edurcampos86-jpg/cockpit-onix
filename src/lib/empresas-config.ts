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
};

export type EmpresaConfig = {
  id: string;
  nome: string;
  abas: AbaEmpresa[];
};

const investimentos: EmpresaConfig = {
  id: "investimentos",
  nome: "Onix Investimentos",
  abas: [
    { label: "Onboard", icon: "UserPlus", emBreve: true },
    { label: "Rotina", icon: "CalendarCheck", href: "/empresas/investimentos/painel-do-dia" },
    { label: "KPIs", icon: "Gauge", href: "/empresas/investimentos/performance" },
    { label: "Negócios", icon: "Handshake", href: "/empresas/investimentos/clientes" },
    { label: "ROI", icon: "DollarSign", href: "/empresas/investimentos/receita" },
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
    { label: "ROI", icon: "DollarSign", href: `/empresas/${slug}/roi` },
    { label: "Treinamento", icon: "GraduationCap", href: `/empresas/${slug}/treinamento` },
    { label: "Time/Pessoas", icon: "UsersRound", emBreve: true },
    { label: "Melhorias", icon: "Sparkles", href: `/configuracoes/implementacoes/nova?empresa=${slug}` },
  ];
}

const corretora: EmpresaConfig = {
  id: "corretora",
  nome: "Onix Corretora",
  abas: abasPadrao("corretora"),
};

const planejamento: EmpresaConfig = {
  id: "planejamento",
  nome: "Planejamento Patrimonial",
  abas: abasPadrao("planejamento"),
};

const imobiliaria: EmpresaConfig = {
  id: "imobiliaria",
  nome: "Onix Imobiliária",
  abas: abasPadrao("imobiliaria"),
};

const corporate: EmpresaConfig = {
  id: "corporate",
  nome: "Onix Corporate",
  abas: abasPadrao("corporate"),
};

/* Com a flag desligada, EMPRESAS fica idêntico ao estado pré-F4 —
 * as empresas novas não aparecem nem no select de Implementações. */
const NAV_V2 = process.env.NEXT_PUBLIC_NAV_V2 === "true";

export const EMPRESAS: EmpresaConfig[] = NAV_V2
  ? [investimentos, corretora, planejamento, imobiliaria, corporate]
  : [investimentos];
