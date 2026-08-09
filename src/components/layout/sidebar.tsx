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
  Lightbulb,
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
  ToggleLeft,
  Database,
  PackagePlus,
  Mail,
  Home,
  PiggyBank,
  Building,
  Network,
  Cpu,
  Radar,
} from "lucide-react";
import { useState, useSyncExternalStore, useTransition, useEffect } from "react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

/* ── Seções de cada empresa ─────────────────────────── */

/* F5 Meta Ads (Fase 1) — item visível só com a flag ligada. Entrar em
 * mktNavigation cobre as duas navs: marketingItemsV2 deriva daqui. */
const PIXEL_TRAFEGO_ON = process.env.NEXT_PUBLIC_PIXEL_TRAFEGO === "true";

const mktNavigation = [
  /* Aponta para `/painel`, não para a raiz: com a flag `HUB_ECOSSISTEMA`
   * ligada a raiz vira o hub, e um item chamado "Painel" levando ao hub
   * mentiria. Com a flag desligada os dois endereços renderizam o mesmo
   * painel, então a troca não muda nada hoje. */
  { name: "Painel", href: "/painel", icon: LayoutDashboard },
  { name: "Calendário", href: "/calendario", icon: CalendarDays },
  { name: "Roteiros", href: "/roteiros", icon: FileText },
  { name: "Planejamento", href: "/planejamento", icon: Wand2 },
  { name: "Tarefas", href: "/tarefas", icon: CheckSquare },
  { name: "Leads", href: "/leads", icon: Users },
  ...(PIXEL_TRAFEGO_ON
    ? [{ name: "Pixel & Tráfego", href: "/pixel-trafego", icon: Radar }]
    : []),
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
  { name: "Implementações", href: "/configuracoes/implementacoes", icon: Lightbulb },
  { name: "Flags", href: "/configuracoes/flags", icon: ToggleLeft },
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
  { name: "Implementações", href: "/configuracoes/implementacoes", icon: Lightbulb },
  { name: "Permissões", href: "/configuracoes/permissoes", icon: Shield },
  { name: "Flags", href: "/configuracoes/flags", icon: ToggleLeft },
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
  {
    id: "onix-tech",
    label: "Onix Tech",
    icon: Cpu,
    items: [{ name: "Painel", href: "/empresas/tech", icon: LayoutDashboard }],
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

// Hrefs visíveis só pra admin (gate COSMÉTICO do nav — a segurança real é o
// redirect na própria página, ex.: /configuracoes/implementacoes). O isAdmin
// COMPLETO (role OU teamRole) vem de /api/auth/is-admin.
const ADMIN_ONLY_HREFS = ["/configuracoes/implementacoes", "/configuracoes/permissoes", "/configuracoes/flags"];

function getActiveModuleIdV2(pathname: string): string {
  if (pathname.startsWith("/onix-corretora")) return "onix-corretora";
  if (pathname.startsWith("/empresas/investimentos")) return "onix-invest";
  if (pathname.startsWith("/empresas/corretora")) return "onix-corretora";
  if (pathname.startsWith("/empresas/planejamento")) return "onix-planejamento";
  if (pathname.startsWith("/empresas/imobiliaria")) return "onix-imobiliaria";
  if (pathname.startsWith("/empresas/corporate")) return "onix-corporate";
  if (pathname.startsWith("/empresas/tech")) return "onix-tech";
  if (pathname.startsWith("/time")) return "pessoas";
  if (
    ["/juridico", "/admin/auditoria", "/admin/juridico", "/admin/importacao"].some((p) =>
      pathname.startsWith(p),
    )
  )
    return "juridico";
  if (
    ["/admin/backups", "/integracoes", "/metodo", "/glossario", "/configuracoes/implementacoes", "/configuracoes/permissoes", "/configuracoes/flags"].some((p) =>
      pathname.startsWith(p),
    )
  )
    return "operacoes";
  // Demais rotas (raiz + páginas de marketing) caem em Marketing
  return "marketing";
}

/* ── Recolhimento automático em tela estreita ────────
 *
 * A sidebar tinha largura FIXA de 256px em qualquer viewport, e só recolhia no
 * clique. Num celular de 420px isso deixava 144px de área útil para a página —
 * medido, e vale para o app inteiro (o Painel de Comando a 420px também fica
 * com 164px). O hub é a primeira tela, então é onde mais aparece.
 *
 * O corte é `lg` (1024px), o mesmo do Tailwind, e não um número inventado.
 * Abaixo dele a sidebar nasce recolhida (64px); o botão de recolher continua
 * mandando quando o usuário o usa.
 *
 * `useSyncExternalStore` e NÃO `useEffect` + `setState`: o repo já pagou por um
 * `setState` dentro de efeito aqui (cascata de render + `react-hooks/
 * set-state-in-effect` travando o CI — ver a nota em `moduloAnterior` abaixo).
 * Esta é a API própria do React para ler valor externo do browser: o servidor
 * responde `false` (idêntico ao comportamento de hoje) e o React corrige na
 * hidratação, sem efeito e sem render em cascata.
 */
const CONSULTA_TELA_ESTREITA = "(max-width: 1023px)";

function assinarLarguraDaTela(aoMudar: () => void): () => void {
  const mql = window.matchMedia(CONSULTA_TELA_ESTREITA);
  mql.addEventListener("change", aoMudar);
  return () => mql.removeEventListener("change", aoMudar);
}

function lerTelaEstreita(): boolean {
  return window.matchMedia(CONSULTA_TELA_ESTREITA).matches;
}

/* No servidor não existe viewport. `false` mantém o HTML inicial igual ao de
 * antes desta mudança — quem estiver no celular vê a sidebar recolher logo
 * após a hidratação, o que é preferível a renderizar recolhido no desktop. */
function lerTelaEstreitaNoServidor(): boolean {
  return false;
}

/* ── Preferência MANUAL, persistida ──────────────────
 *
 * Sem isto, a escolha do usuário morria a cada recarga. Antes do recolhimento
 * automático ninguém sentia — o padrão era sempre expandido, então "voltou ao
 * padrão" e "esqueceu minha escolha" eram indistinguíveis. Com o padrão agora
 * dependendo da TELA, a escolha manual virou decisão de verdade: quem recolhe
 * de propósito num monitor largo via a barra reabrir sozinha, e isso lê como
 * defeito, não como design.
 *
 * `localStorage`, a mesma casa de `onix-theme`. Ausente = segue a tela.
 *
 * NÃO há script inline anti-flash aqui, ao contrário do tema: a largura vem de
 * classe Tailwind no `<aside>`, não de classe no `<html>`, então pré-aplicar
 * exigiria mover a largura para CSS de raiz. A correção acontece em um frame e
 * o `<aside>` já tem `transition-all`, então ela sai animada em vez de piscar.
 */
const CHAVE_SIDEBAR = "onix-sidebar";

const ouvintesSidebar = new Set<() => void>();

function assinarPreferenciaSidebar(aoMudar: () => void): () => void {
  ouvintesSidebar.add(aoMudar);
  const aoStorage = (e: StorageEvent) => {
    if (e.key === CHAVE_SIDEBAR) aoMudar();
  };
  window.addEventListener("storage", aoStorage);
  return () => {
    ouvintesSidebar.delete(aoMudar);
    window.removeEventListener("storage", aoStorage);
  };
}

/** `null` = sem preferência salva, segue a largura da tela. */
function lerPreferenciaSidebar(): boolean | null {
  try {
    const salvo = localStorage.getItem(CHAVE_SIDEBAR);
    if (salvo === "recolhida") return true;
    if (salvo === "expandida") return false;
    return null;
  } catch {
    return null;
  }
}

function lerPreferenciaSidebarNoServidor(): boolean | null {
  return null;
}

function gravarPreferenciaSidebar(recolhida: boolean) {
  try {
    localStorage.setItem(CHAVE_SIDEBAR, recolhida ? "recolhida" : "expandida");
  } catch {
    // Sem persistência a escolha ainda vale nesta sessão.
  }
  for (const ouvinte of ouvintesSidebar) ouvinte();
}

/* ── Componente Sidebar ─────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  /* `null` = segue a largura da tela; booleano = o usuário decidiu na mão e a
   * escolha dele passa a valer em qualquer largura, inclusive depois de
   * recarregar (mora no localStorage). */
  const preferenciaManual = useSyncExternalStore(
    assinarPreferenciaSidebar,
    lerPreferenciaSidebar,
    lerPreferenciaSidebarNoServidor,
  );
  const telaEstreita = useSyncExternalStore(
    assinarLarguraDaTela,
    lerTelaEstreita,
    lerTelaEstreitaNoServidor,
  );
  const collapsed = preferenciaManual ?? telaEstreita;
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

  // Auto-open the section when route changes to a different module.
  //
  // Ajuste DURANTE o render, não em useEffect. O efeito equivalente chamava
  // setState de forma síncrona no corpo do effect: o React renderizava a
  // seção fechada, o efeito rodava, e um segundo render a abria — cascata
  // visível como piscada na navegação, e erro de lint
  // (react-hooks/set-state-in-effect) que deixava o arquivo inteiro vermelho
  // no CI, bloqueando qualquer mudança no menu.
  //
  // O padrão de "ajustar estado quando uma prop muda" é guardar o valor
  // anterior e comparar no render (react.dev/learn/you-might-not-need-an-effect).
  const [moduloAnterior, setModuloAnterior] = useState(activeModuleId);
  if (activeModuleId !== moduloAnterior) {
    setModuloAnterior(activeModuleId);
    if (activeModuleId) {
      setOpenSections((prev) => ({ ...prev, [activeModuleId]: true }));
    }
  }

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Esconde itens admin-only do nav pra não-admin (cosmético; gate real é na
  // página). Default false (fail-closed): não-admin nunca vê o link. isAdmin
  // COMPLETO (role OU teamRole) — o role da sessão sozinho não cobre teamRole.
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissoesUiOn, setPermissoesUiOn] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/is-admin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.isAdmin) setIsAdmin(true);
      })
      .catch(() => {});
    // Link "Permissões" também depende da flag PERMISSOES_UI (default OFF).
    fetch("/api/configuracoes/permissoes/flag")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.enabled) setPermissoesUiOn(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const podeVerItem = (item: { href: string }) => {
    // /configuracoes/permissoes: admin-only E atrás da flag PERMISSOES_UI.
    if (item.href === "/configuracoes/permissoes" && !permissoesUiOn) return false;
    return isAdmin || !ADMIN_ONLY_HREFS.includes(item.href);
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
    if (href === "/empresas/tech") return pathname === "/empresas/tech";
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
    const items = mod.items.filter(podeVerItem);
    if (items.length === 0) return null; // módulo sem itens visíveis (ex.: todos admin-only)
    const hasActiveChild = items.some((item) => isItemActive(item.href));

    if (collapsed) {
      // In collapsed mode, show only the module icon (links to its first page)
      const firstHref = items[0]?.href || "/";
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
            {items.map(renderNavLink)}
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
      {/* ── Header: Ecossistema Onix — volta para o hub ──────────────────
        * `Link` de verdade, não `onClick` com `router.push`: é o que preserva
        * clique do meio, abrir em nova aba, arrastar para a barra de favoritos
        * e "copiar endereço do link". Um handler entregaria só o clique
        * esquerdo e quebraria as outras quatro em silêncio.
        *
        * O padding saiu do container e foi para o `Link`: assim a área
        * clicável é a faixa inteira de 64px de altura, não só o texto.
        *
        * SEM estado ativo, de propósito — e o motivo não é "já tem outro
        * indicador". MEDIDO: o item "Início" (`inicioItemV2`) só existe com
        * `NEXT_PUBLIC_NAV_V2=true`; com a flag desligada este logo é o ÚNICO
        * link para `/` na sidebar inteira. O argumento é outro: logo de
        * produto não é item de navegação. Ele é âncora de identidade, está
        * fora da lista, e pintá-lo de "ativo" o transformaria num sétimo item
        * de menu competindo com os de verdade. O link segue clicável em `/`,
        * levando a lugar nenhum, que é o comportamento esperado de um logo em
        * qualquer site.
        *
        * O rótulo diz "hub" porque `/` renderiza o hub com `HUB_ECOSSISTEMA`
        * ON — o estado de produção hoje. Se a flag for desligada, `/` volta a
        * ser o Painel de Comando (`src/app/page.tsx`) e ESTE TEXTO passa a
        * mentir: é a única linha a revisitar num rollback da flag. */}
      <div className="flex items-center h-16 border-b border-sidebar-border">
        {!collapsed ? (
          <Link
            href="/"
            aria-label="Voltar ao hub do Ecossistema Onix"
            className="group flex items-center gap-2 w-full h-full px-4 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            <div className="flex-1 min-w-0">
              {/* `group-hover` no texto além do fundo: o realce do fundo
                * sozinho é sutil demais para dizer "isto é clicável" a quem
                * nunca tentou. */}
              <h1 className="text-sm font-bold text-sidebar-foreground transition-colors group-hover:text-primary">
                Ecossistema Onix
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">Eduardo Campos</p>
            </div>
          </Link>
        ) : (
          /* Recolhida: só o quadrado do logo, e ele CONTINUA clicável — é a
            * única saída para o hub nesse estado, porque os rótulos do nav
            * somem. Tooltip como nos módulos recolhidos (`renderModule`), para
            * quem não reconhece o "O" saber para onde vai. */
          <Tooltip>
            {/* `render`, não `asChild`: este Tooltip é Base UI, não Radix — o
              * `asChild` do Radix seria IGNORADO aqui e o trigger renderiza
              * `<button>` por padrão, envolvendo o `<a>`. Além de HTML
              * inválido, botão em volta de link engole exatamente o clique do
              * meio e o "abrir em nova aba" que esta mudança existe para
              * preservar.
              *
              * Sem `nativeButton={false}`: esta versão do Base UI não expõe
              * essa prop no Trigger do Tooltip (ela vive em `NativeButtonProps`,
              * que `TooltipTriggerProps` não estende) — conferido no `.d.ts`,
              * e o `tsc` recusa. O `<a>` continua correto: o `render` substitui
              * o elemento, e a navegação por Enter é a nativa do link. */}
            <TooltipTrigger
              render={
                <Link
                  href="/"
                  aria-label="Voltar ao hub do Ecossistema Onix"
                  className="flex items-center justify-center w-full h-full outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                />
              }
            >
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-sm">O</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Ecossistema Onix — voltar ao hub</TooltipContent>
          </Tooltip>
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
              {sharedNavigation.filter(podeVerItem).map(renderNavLink)}
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
        {/* Atalho global para a própria ficha: /time/eu resolve em um clique o
            que antes exigia achar o próprio nome entre 19 cards. É o caminho do
            self-service de telefone e foto. */}
        <Link
          href="/time/eu"
          className={cn(
            "flex items-center py-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors mb-1.5",
            collapsed ? "justify-center w-full" : "px-2"
          )}
          title="Meu cadastro"
        >
          <UserCircle className="h-4 w-4" />
          {!collapsed && <span className="ml-2 text-sm">Meu cadastro</span>}
        </Link>
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
          {/* O botão só tinha um ícone: para leitor de tela era "botão", sem
            * nome. Agora que ele guarda uma PREFERÊNCIA (e não só um estado da
            * sessão), vale ainda mais dizer o que ele faz. */}
          <button
            type="button"
            onClick={() => gravarPreferenciaSidebar(!collapsed)}
            aria-label={collapsed ? "Expandir o menu lateral" : "Recolher o menu lateral"}
            title={collapsed ? "Expandir o menu lateral" : "Recolher o menu lateral"}
            className="flex items-center justify-center py-2 px-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
