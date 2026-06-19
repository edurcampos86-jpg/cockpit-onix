"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { FloatingChat } from "@/components/agents/floating-chat";
import { FloatingImplementacoes } from "@/components/implementacoes/floating-implementacoes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isPrintPage = pathname.endsWith("/print");
  const isResetPage = pathname === "/recriar-senha";
  // Páginas públicas (LGPD + Google verification): acessíveis sem login
  // e renderizadas sem o shell para ficarem limpas pro reviewer.
  const isPublicLegalPage = pathname === "/privacy" || pathname === "/terms";

  if (isLoginPage || isPrintPage || isResetPage || isPublicLegalPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <FloatingChat />
      <FloatingImplementacoes />
    </div>
  );
}
