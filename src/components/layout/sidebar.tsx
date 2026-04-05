"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Settings,
  ChevronLeft,
  ChevronRight,
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
  Sun,
  Moon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/actions/auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

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
  { name: "Integrações", href: "/integracoes", icon: Plug },
  { name: "Configurações", href: "/configuracoes", icon: Settings },
];

const onixCorretorNavigation = [
  { name: "Painel", href: "/onix-corretora", icon: LayoutDashboard },
  { name: "Painel Semanal", href: "/onix-corretora/painel-semanal", icon: Gauge },
  { name: "Reuniao Semanal", href: "/onix-corretora/reuniao", icon: Presentation },
  { name: "Alertas Pipeline", href: "/onix-corretora/alertas", icon: AlertTriangle },
  { name: "Desenvolvimento", href: "/onix-corretora/desenvolvimento", icon: GraduationCap },
  { name: "Relatórios", href: "/onix-corretora/relatorios", icon: ClipboardList },
  { name: "Padrões Coletivos", href: "/onix-corretora/coletivo", icon: Users },
  { name: "Plano de Ação", href: "/onix-corretora/acoes", icon: ListChecks },
  { name: "Comparativo", href: "/onix-corretora/comparativo", icon: BarChart2 },
  { name: "Boas Práticas", href: "/onix-corretora/praticas", icon: BookOpen },
  { name: "Perfis do Time", href: "/onix-corretora/perfis", icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { theme, toggleTheme } = useTheme();

  const isOnixCorretora = pathname.startsWith("/onix-corretora");
  const navigation = isOnixCorretora ? onixCorretorNavigation : mktNavigation;

  const moduleLabel = isOnixCorretora ? "Onix Corretora" : "Mídias Sociais";
  const moduleInitial = isOnixCorretora ? "C" : "M";

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo + Module Label */}
      <div className="flex items-center h-16 px-4 border-b border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center gap-2 w-full">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-sidebar-foreground">Eduardo</h1>
              <p className="text-[10px] text-muted-foreground truncate">{moduleLabel}</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
        )}
      </div>

      {/* Module switcher */}
      {!collapsed && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <div className="flex rounded-lg bg-sidebar-accent p-0.5 gap-0.5">
            <button
              onClick={() => router.push("/")}
              className={cn(
                "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                !isOnixCorretora
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-sidebar-foreground"
              )}
            >
              MKT
            </button>
            <button
              onClick={() => router.push("/onix-corretora")}
              className={cn(
                "flex-1 text-[11px] font-medium py-1 rounded-md transition-colors",
                isOnixCorretora
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-sidebar-foreground"
              )}
            >
              Corretora
            </button>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/onix-corretora"
              ? pathname === "/onix-corretora"
              : item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          const link = (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary")} />
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
        })}
      </nav>

      {/* User info & collapse button */}
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
          {/* Botão de tema */}
          <Tooltip>
            <TooltipTrigger
              onClick={toggleTheme}
              className="flex items-center justify-center py-2 px-2 rounded-lg text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </TooltipTrigger>
            <TooltipContent side="top">
              {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </TooltipContent>
          </Tooltip>
          {/* Botão de collapse */}
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
