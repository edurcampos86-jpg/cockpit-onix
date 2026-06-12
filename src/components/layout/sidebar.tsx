"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutDashboard,
  FileText,
  CheckSquare,
  Users,
  BarChart3,
  BarChart2,
  TrendingUp,
  Target,
  Mic,
  Plug,
  Compass,
  BookMarked,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Wand2,
  ClipboardList,
  ListChecks,
  BookOpen,
  UserCircle,
  Gauge,
  Presentation,
  AlertTriangle,
  GraduationCap,
  Map,
  CalendarCheck,
  Sun,
  Moon,
  Megaphone,
  Briefcase,
  Building2,
  UsersRound,
  PieChart,
  Scale,
  Shield,
  Database,
  PackagePlus,
  Mail,
  Home,
  PiggyBank,
  Building,
  Network,
} from "lucide-react";
import { useState, useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

/* ── Seções de cada empresa ─────────────────────────── */

const mktNavigation = [
  { name: "Painel", href: "/", icon: LayoutDashboard },
  { name: "Calendário", href: "/calendario", icon: CalendarDays },
  { name: "Roteiros", href: "/roteiros", icon: FileText },
  { name: "Planejamento", href: "/planejamento", icon: Wand2 },
  { name: "Tarefas", href: "/tarefas", icon: CheckSquare },
  { name: "Leads", href: "/leads", icon: Users },
  { name: "Relatório", href: "/relatorio", icon: BarChart3 },
  { name: "Analytics", href: "/analytics", icon: TrendingUp },
  { name: "KPIs", href: "/kpis", icon: Target },
  { name: "Reuniões", href: "/reunioes", icon: Mic },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

const onixCorretorNavigation = [
  { name: "Painel", href: "/onix-corretora", icon: LayoutDashboard },
  { name: "Painel Semanal", href: "/onix-corretora/painel-semanal", icon: Gauge },
  { name: "Reunião Semanal", href: "/onix-corretora/reuniao", icon: Presentation },
  { name: "Alertas Pipeline", href: "/onix-corretora/alertas", icon: AlertTriangle },
  { name: "Desenvolvimento", href: "/onix-corretora/desenvolvimento", icon: GraduationCap },
  { name: "Projeto T&D", href: "/onix-corretora/projeto-td", icon: Map },
  { name: "Rituais", href: "/onix-corretora/rituais", icon: CalendarCheck },
  { name: "Relatórios", href: "/onix-corretora/relatorios", icon: ClipboardList },
  { name: "Padrões Coletivos", href: "/onix-corretora/coletivo", icon: Users },
  { name: "Plano de Ação", href: "/onix-corretora/acoes", icon: ListChecks },
  { name: "Comparativo", href: "/onix-corretora/comparativo", icon: BarChart2 },
  { name: "Boas Práticas", href: "/onix-corretora/praticas", icon: BookOpen },
  { name: "Perfis do Time", href: "/onix-corretora/perfis", icon: UserCircle },
];

const backofficeNavigation = [
  { name: "Painel", href: "/empresas/investimentos", icon: LayoutDashboard },
  { name: "Painel do Dia", href: "/empresas/investimentos/painel-do-dia", icon: Target },
  { name: "Clientes", href: "/empresas/investimentos/clientes", icon: Users },
  { name: "Cadência 12-4-2", href: "/empresas/investimentos/cadencia", icon: CalendarCheck },
  { name: "Storyselling", href: "/empresas/investimentos/storyselling", icon: BookOpen },
  { name: "Indicações", href: "/empresas/investimentos/indicacoes", icon: UserCircle },
  { name: "Performance", href: "/empresas/investimentos/performance", icon: Gauge },
  { name: "BTG Dashboard", href: "/empresas/investimentos/btg", icon: Building2 },
  { name: "Receita", href: "/empresas/investimentos/receita", icon: BarChart3 },
  { name: "Tarefas", href: "/empresas/investimentos/tarefas", icon: CheckSquare },
  { name: "Relatórios", href: "/empresas/investimentos/relatorios", icon: ClipboardList },
  { name: "Configurações", href: "/empresas/investimentos/configuracoes", icon: Settings },
];

/* ── Itens compartilhados (Geral) ───────────────────── */

const sharedNavigation = [
  { name: "Método Onix", href: "/metodo", icon: Compass },
  { name: "Time", href: "/time", icon: UsersRound },
  { name: "Insights do Time", href: "/time/insights", icon: PieChart },
  { name: "Jurídico", href: "/juridico/contratos", icon: Scale },
  { name: "Auditoria", href: "/admin/auditoria/contratos", icon: Shield },
  { name: "Ingestão por Email", href: "/admin/juridico/email-ingest", icon: Mail },
  { name: "Importar Jurídico", href: "/admin/importacao/juridico", icon: PackagePlus },
  { name: "Backups", href: "/admin/backups", icon: Database },
  { name: "Glossário", href: "/glossario", icon: BookMarked },
  { name: "Integrações", href: "/integracoes", icon: Plug },
];

/* ── Definição dos módulos / empresas ───────────────── */

const modules = [
  {
    id: "mkt",
    label: "Mídias Sociais",
    icon: Megaphone,
    items: mktNavigation,
    pathPrefix: null as string | null, // root paths
  },
  {
    id: "corretora",
    label: "Corretora",
    icon: Briefcase,
    items: onixCorretorNavigation,
    pathPrefix: "/onix-corretora",
  },
  {
    id: "backoffice",
    label: "Assessoria",
    icon: Building2,
    items: backofficeNavigation,
    pathPrefix: "/empresas/investimentos",
  },
];

/* ── Helper: detectar módulo ativo pela rota ─────────── */

function getActiveModuleId(pathname: string): string {
  if (pathname.startsWith("/onix-corretora")) return "corretora";
  if (pathname.startsWith("/empresas/investimentos")) return "backoffice";
  // Shared pages don't belong to a module
  if (
    ["/metodo", "/time", "/glossario", "/integracoes", "/juridico", "/admin/auditoria", "/admin/importacao", "/admin/backups", "/admin/juridico"].some(
      (p) => pathname.startsWith(p),
    )
  )
    return "";
  return "mkt";
}

/* ────────────────────────────────────────────────────────────────
 * NAV V2 — modelo híbrido (atrás da flag NEXT_PUBLIC_NAV_V2)
 * Mesma navegação de rotas; apenas reorganiza a arquitetura de
 * informação em grupos "Empresas" e "Transversal" + itens globais.
 * Os arrays antigos acima permanecem intactos.
 * ──────────────────────────────────────────────────────────────── */

const NAV_V2 = process.env.NEXT_PUBLIC_NAV_V2 === "true";

// Marketing reaproveita o mktNavigation sem "Painel" (vira "Início" global)
// e sem "Configurações" (vira item global no rodapé).
const marketingItemsV2 = mktNavigation.filter(
  (item) => item.name !== "Painel" && item.name !== "Configurações",
);

const pessoasItemsV2 = [
  { name: "Time", href: "/time", icon: UsersRound },
  { name: "Insights do Time", href: "/time/insights", icon: PieChart },
];

const juridicoItemsV2 = [
  { name: "Jurídico", href: "/juridico/contratos", icon: Scale },
  { name: "Auditoria", href: "/admin/auditoria/contratos", icon: Shield },
  { name: "Ingestão por Email", href: "/admin/juridico/email-ingest", icon: Mail },
  { name: "Importar Jurídico", href: "/admin/importacao/juridico", icon: PackagePlus },
];

const operacoesItemsV2 = [
  { name: "Backups", href: "/admin/backups", icon: Database },
  { name: "Integrações", href: "/integracoes", icon: Plug },
  { name: "Método Onix", href: "/metodo", icon: Compass },
  { name: "Glossário", href: "/glossario", icon: BookMarked },
];

// F4 — shells das demais empresas: um item "Painel" por empresa; as demais
// abas vivem na barra do EmpresaShell, não na sidebar. A Corretora mantém
// seus itens atuais (/onix-corretora) e ganha o painel da shell nova no topo;
// a migração de namespacing dela é backlog próprio.
const corretoraItemsV2 = [
  { name: "Visão da Empresa (novo)", href: "/empresas/corretora", icon: Building2 },
  ...onixCorretorNavigation,
];

const empresasModulesV2 = [
  { id: "onix-invest", label: "Onix Investimentos", icon: Building2, items: backofficeNavigation },
  { id: "onix-corretora", label: "Onix Corretora", icon: Briefcase, items: corretoraItemsV2 },
  {
    id: "onix-planejamento",
    label: "Planejamento Patrimonial",
    icon: PiggyBank,
    items: [{ name: "Painel", href: "/empresas/planejamento", icon: LayoutDashboard }],
  },
  {
    id: "onix-imobiliaria",
    label: "Onix Imobiliária",
    icon: Building,
    items: [{ name: "Painel", href: "/empresas/imobiliaria", icon: LayoutDashboard }],
  },
  {
    id: "onix-corporate",
    label: "Onix Corporate",
    icon: Network,
    items: [{ name: "Painel", href: "/empresas/corporate", icon: LayoutDashboard }],
  },
];

const transversalModulesV2 = [
  { id: "marketing", label: "Marketing", icon: Megaphone, items: marketingItemsV2 },
  { id: "pessoas", label: "Pessoas", icon: UsersRound, items: pessoasItemsV2 },
  { id: "juridico", label: "Jurídico", icon: Scale, items: juridicoItemsV2 },
  { id: "operacoes", label: "Operações", icon: Database, items: operacoesItemsV2 },
];

const allModulesV2 = [...empresasModulesV2, ...transversalModulesV2];

const inicioItemV2 = { name: "Início", href: "/", icon: Home };
const configItemV2 = { name: "Configurações", href: "/configuracoes", icon: Settings };

function getActiveModuleIdV2(pathname: string): string {
  if (pathname.startsWith("/onix-corretora")) return "onix-corretora";
  if (pathname.startsWith("/empresas/investimentos")) return "onix-invest";
  if (pathname.startsWith("/empresas/corretora")) return "onix-corretora";
  if (pathname.startsWith("/empresas/planejamento")) return "onix-planejamento";
  if (pathname.startsWith("/empresas/imobiliaria")) return "onix-imobiliaria";
  if (pathname.startsWith("/empresas/corporate")) return "onix-corporate";
  if (pathname.startsWith("/time")) return "pessoas";
  if (
    ["/juridico", "/admin/auditoria", "/admin/juridico", "/admin/importacao"].some((p) =>
      pathname.startsWith(p),
    )
  )
    return "juridico";
  if (
    ["/admin/backups", "/integracoes", "/metodo", "/glossario"].some((p) =>
      pathname.startsWith(p),
    )
  )
    return "operacoes";
  // Demais rotas (raiz + páginas de marketing) caem em Marketing
  return "marketing";
}

/* ── Componente Sidebar ─────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { theme, toggleTheme } = useTheme();

  // Tracks which module sections are open (multiple can be open)
  const sectionModules = NAV_V2 ? allModulesV2 : modules;
  const defaultModuleId = NAV_V2 ? "marketing" : "mkt";
  const activeModuleId = NAV_V2 ? getActiveModuleIdV2(pathname) : getActiveModuleId(pathname);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sectionModules.forEach((m) => {
      initial[m.id] = m.id === (activeModuleId || defaultModuleId);
    });
    return initial;
  });

  // Auto-open the section when route changes to a different module
  useEffect(() => {
    if (activeModuleId) {
      setOpenSections((prev) => ({ ...prev, [activeModuleId]: true }));
    }
  }, [activeModuleId]);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  /* ── Check if a nav item is active ── */
  const isItemActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/onix-corretora") return pathname === "/onix-corretora";
    if (href === "/empresas/investimentos") return pathname === "/empresas/investimentos";
    if (href === "/empresas/corretora") return pathname === "/empresas/corretora";
    if (href === "/empresas/planejamento") return pathname === "/empresas/planejamento";
    if (href === "/empresas/imobiliaria") return pathname === "/empresas/imobiliaria";
    if (href === "/empresas/corporate") return pathname === "/empresas/corporate";
    return pathname.startsWith(href);
  };

  /* ── Render a single nav link ── */
  const renderNavLink = (item: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }) => {
    const active = isItemActive(item.href);
    const link = (
      <Link
        key={item.name}
        href={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
        )}
      >
        <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.name}>
          <TooltipTrigger className="w-full">{link}</TooltipTrigger>
          <TooltipContent side="right">{item.name}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  /* ── Render a collapsible module (section header + its items) ── */
  const renderModule = (mod: {
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    items: { name: string; href: string; icon: React.ComponentType<{ className?: string }> }[];
  }) => {
    const isOpen = openSections[mod.id];
    const hasActiveChild = mod.items.some((item) => isItemActive(item.href));

    if (collapsed) {
      // In collapsed mode, show only the module icon (links to its first page)
      const firstHref = mod.items[0]?.href || "/";
      return (
        <Tooltip key={mod.id}>
          <TooltipTrigger className="w-full">
            <Link
              href={firstHref}
              className={cn(
                "flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                hasActiveChild
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <mod.icon className={cn("h-5 w-5 shrink-0", hasActiveChild && "text-primary")} />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right">{mod.label}</TooltipContent>
        </Tooltip>
      );
    }

    return (
      <div key={mod.id}>
        {/* Section header (clickable to expand/collapse) */}
        <button
          onClick={() => toggleSection(mod.id)}
          className={cn(
            "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            hasActiveChild
              ? "text-primary"
              : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
        >
          <mod.icon className={cn("h-4 w-4 shrink-0", hasActiveChild && "text-primary")} />
          <span className="flex-1 text-left">{mod.label}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              isOpen && "rotate-180"
            )}
          />
        </button>

        {/* Collapsible items */}
        <div
          className={cn(
            "overflow-hidden transition-all duration-200",
            isOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="pl-3 space-y-0.5 pb-1">
            {mod.items.map(renderNavLink)}
          </div>
        </div>
      </div>
    );
  };

  /* ── Section label (uppercase group heading) ── */
  const renderSectionLabel = (label: string) =>
    !collapsed && (
      <div className="px-3 pt-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
    );

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* ── Header: Ecossistema Onix ── */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        {!collapsed ? (
          <div className="flex items-center gap-2 w-full">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-sidebar-foreground">Ecossistema Onix</h1>
              <p className="text-[10px] text-muted-foreground truncate">Eduardo Campos</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
        )}
      </div>

      {/* ── Scrollable nav area ── */}
      <div className="flex-1 overflow-y-auto">
        {NAV_V2 ? (
          <>
            {/* ── Item global: Início (fixo no topo) ── */}
            <div className="px-2 pt-3 pb-2 space-y-0.5">
              {renderNavLink(inicioItemV2)}
            </div>

            {/* ── EMPRESAS ── */}
            {renderSectionLabel("Empresas")}
            <div className="px-2 pb-2 space-y-1">
              {empresasModulesV2.map(renderModule)}
            </div>

            {/* ── TRANSVERSAL ── */}
            {renderSectionLabel("Transversal")}
            <div className="px-2 pb-2 space-y-1">
              {transversalModulesV2.map(renderModule)}
            </div>
          </>
        ) : (
          <>
            {/* ── GERAL ── */}
            {renderSectionLabel("Geral")}
            <div className="px-2 pb-2 space-y-0.5">
              {sharedNavigation.map(renderNavLink)}
            </div>

            {/* ── EMPRESAS ── */}
            {renderSectionLabel("Empresas")}
            <div className="px-2 pb-2 space-y-1">
              {modules.map(renderModule)}
            </div>
          </>
        )}
      </div>

      {/* ── Item global: Configurações (fixo no rodapé) ── */}
      {NAV_V2 && (
        <div className="border-t border-sidebar-border px-2 py-2 space-y-0.5">
          {renderNavLink(configItemV2)}
        </div>
      )}

      {/* ── User info & actions ── */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="flex items-center gap-3 mb-3 px-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-xs font-bold">EC</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">Eduardo Campos</p>
              <p className="text-[10px] text-muted-foreground">Admin</p>
            </div>
          </div>
        )}
        <div className="flex gap-1.5">
          <button
            onClick={() => startTransition(() => logout())}
            disabled={isPending}
            className={cn(
              "flex items-center justify-center py-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors",
              collapsed ? "w-full" : "flex-1"
            )}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2 text-sm">Sair</span>}
          </button>
          <Tooltip>
            <TooltipTrigger
              onClick={toggleTheme}
              className="flex items-center justify-center py-2 px-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </TooltipTrigger>
            <TooltipContent side="top">
              {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </TooltipContent>
          </Tooltip>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center py-2 px-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
