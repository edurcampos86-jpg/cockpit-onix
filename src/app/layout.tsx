import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { getOptionalAuthContext, getEffectivePermissoes } from "@/lib/auth-helpers";
import { PERMISSOES_TUDO } from "@/lib/permissoes";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecossistema Onix",
  description: "Plataforma integrada de gestão — Onix Capital",
};

// Script inline executado antes do render para evitar flash de tema errado (FOUC)
const themeScript = `
  (function() {
    try {
      var saved = localStorage.getItem('onix-theme');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      }
    } catch(e) {}
  })();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const ctx = await getOptionalAuthContext();
  const permissoes = ctx ? getEffectivePermissoes(ctx) : PERMISSOES_TUDO;
  const userNome = ctx?.pessoa?.nomeCompleto || ctx?.name || "Visitante";
  const isAdminUI = ctx
    ? ctx.role === "admin" || ctx.pessoa?.teamRole === "admin"
    : false;

  return (
    <html lang="pt-BR" className={poppins.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <AppShell
              permissoes={permissoes}
              userNome={userNome}
              isAdmin={isAdminUI}
            >
              {children}
            </AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
