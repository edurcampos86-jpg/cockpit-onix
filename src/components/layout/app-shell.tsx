"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Assistente } from "@/components/onix-corretora/assistente";
import type { PermissoesAcesso } from "@/lib/permissoes";

export function AppShell({
  children,
  permissoes,
  userNome,
  isAdmin,
}: {
  children: React.ReactNode;
  permissoes: PermissoesAcesso;
  userNome: string;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isPrintPage = pathname.endsWith("/print");
  const isOnboardingPage = pathname.startsWith("/onboarding");

  if (isLoginPage || isPrintPage || isOnboardingPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar permissoes={permissoes} userNome={userNome} isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      {pathname.startsWith("/onix-corretora") && permissoes.corretora && (
        <Assistente />
      )}
    </div>
  );
}
