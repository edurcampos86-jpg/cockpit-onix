import { notFound } from "next/navigation";
import { EmpresaShell } from "@/components/layout/empresa-shell";
import { podeVerEmpresa } from "@/lib/empresas/gate-pagina";
import { EMPRESAS } from "@/lib/empresas-config";

/* Flag de navegação V2. Desligada = comportamento atual 100% intacto. */
const NAV_V2 = process.env.NEXT_PUBLIC_NAV_V2 === "true";

export default async function CorporateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Gate de acesso ANTES de qualquer render — vale para todas as abas
   * desta empresa. Fora de escopo responde INEXISTENTE, não "negado"
   * (ver `lib/empresas/gate-pagina.ts`). */
  if (!(await podeVerEmpresa("corporate"))) notFound();

  if (!NAV_V2) return <>{children}</>;

  const empresa = EMPRESAS.find((e) => e.id === "corporate");
  if (!empresa) return <>{children}</>;

  return <EmpresaShell config={empresa}>{children}</EmpresaShell>;
}
