import { notFound } from "next/navigation";

import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

import { ImportarCorretora } from "./importar-cliente";

/**
 * /empresas/corretora/importar — subir o relatório de uma seguradora.
 *
 * O gate é de ADMIN, não só de sessão: esta tela grava a base de contratos de
 * uma empresa inteira. O layout da Corretora já barra quem não vê a empresa;
 * este barra quem vê a empresa mas não administra.
 */
export const dynamic = "force-dynamic";

export default async function ImportarCorretoraPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) notFound();
  return <ImportarCorretora />;
}
