import { EmpresaShell } from "@/components/layout/empresa-shell";
import { EMPRESAS } from "@/lib/empresas-config";

/* Flag de navegação V2. Desligada = comportamento atual 100% intacto. */
const NAV_V2 = process.env.NEXT_PUBLIC_NAV_V2 === "true";

export default function TechLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!NAV_V2) return <>{children}</>;

  const empresa = EMPRESAS.find((e) => e.id === "tech");
  if (!empresa) return <>{children}</>;

  return <EmpresaShell config={empresa}>{children}</EmpresaShell>;
}
