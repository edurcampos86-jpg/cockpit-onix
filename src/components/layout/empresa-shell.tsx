"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserPlus,
  CalendarCheck,
  Gauge,
  Handshake,
  DollarSign,
  GraduationCap,
  UsersRound,
  Sparkles,
  Building2,
  Repeat,
  Share2,
  Boxes,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EmpresaConfig } from "@/lib/empresas-config";

/* Mapa nome (string da config) -> componente lucide. */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  UserPlus,
  CalendarCheck,
  Gauge,
  Handshake,
  DollarSign,
  GraduationCap,
  UsersRound,
  Sparkles,
  Building2,
  Repeat,
  Share2,
  Boxes,
};

export function EmpresaShell({
  config,
  children,
}: {
  config: EmpresaConfig;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href?: string) =>
    !!href && (pathname === href || pathname.startsWith(href + "/"));

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Barra de abas (sticky no topo, rolável no mobile) ── */}
      <div className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="flex items-center gap-2 px-4 pt-3">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_0_3px_rgba(255,177,20,0.25)]" />
          <h2 className="text-sm font-bold tracking-tight text-foreground">{config.nome}</h2>
        </div>
        <nav
          className="flex gap-1.5 overflow-x-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label={`Abas de ${config.nome}`}
        >
          {config.abas.map((aba) => {
            const Icon = ICONS[aba.icon] ?? Circle;

            if (aba.emBreve) {
              return (
                <button
                  key={aba.label}
                  type="button"
                  disabled
                  aria-disabled="true"
                  className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground/50 cursor-not-allowed"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{aba.label}</span>
                  <span className="ml-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Em breve
                  </span>
                </button>
              );
            }

            const active = isActive(aba.href);
            return (
              <Link
                key={aba.label}
                href={aba.href!}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{aba.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Conteúdo da página (rota /backoffice já existente) ── */}
      <div className="flex-1">{children}</div>
    </div>
  );
}
