"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { FloatingChat } from "@/components/agents/floating-chat";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const isPrintPage = pathname.endsWith("/print");
  const isResetPage = pathname === "/recriar-senha";

  if (isLoginPage || isPrintPage || isResetPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <FloatingChat />
    </div>
  );
}
