import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { resolverAcessoSidebar } from "@/lib/sidebar/resolver";

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
  /* A sidebar filtrada é resolvida AQUI, no servidor, e desce como prop.
   *
   * O gate antigo do menu roda em `useEffect` com default `false`: a lista
   * aparece sem os itens de admin e depois eles brotam. Com a régua completa
   * seriam até 9 itens piscando a cada navegação. Resolvido aqui, o HTML já
   * sai certo — sem segundo render e sem requisição extra.
   *
   * `null` = flag desligada; a sidebar então se comporta exatamente como antes. */
  const acessoSidebar = await resolverAcessoSidebar();

  return (
    <html lang="pt-BR" className={poppins.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        <ThemeProvider>
          <TooltipProvider>
            <AppShell acessoSidebar={acessoSidebar}>{children}</AppShell>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
