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

export const EMPRESAS: EmpresaConfig[] = [investimentos];
