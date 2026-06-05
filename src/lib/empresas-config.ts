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
    { label: "Rotina", icon: "CalendarCheck", href: "/backoffice/painel-do-dia" },
    { label: "KPIs", icon: "Gauge", href: "/backoffice/performance" },
    { label: "Negócios", icon: "Handshake", href: "/backoffice/clientes" },
    { label: "ROI", icon: "DollarSign", href: "/backoffice/receita" },
    { label: "Treinamento", icon: "GraduationCap", href: "/backoffice/storyselling" },
    { label: "Time/Pessoas", icon: "UsersRound", emBreve: true },
    { label: "Melhorias", icon: "Sparkles", emBreve: true }, // Fase 3
    // ── Núcleo cliente ──
    { label: "BTG", icon: "Building2", href: "/backoffice/btg" },
    { label: "Cadência", icon: "Repeat", href: "/backoffice/cadencia" },
    { label: "Indicações", icon: "Share2", href: "/backoffice/indicacoes" },
    { label: "Grupos", icon: "Boxes", href: "/backoffice/grupos" },
  ],
};

export const EMPRESAS: EmpresaConfig[] = [investimentos];
