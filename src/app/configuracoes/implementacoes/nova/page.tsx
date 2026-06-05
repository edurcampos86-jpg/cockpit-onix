import { getAuthContext } from "@/lib/auth-helpers";
import { EMPRESAS } from "@/lib/empresas-config";
import { ImplementacaoForm } from "./implementacao-form";

export const dynamic = "force-dynamic";

export default async function NovaImplementacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  await getAuthContext(); // exige login

  const sp = await searchParams;
  const empresaId =
    sp.empresa && EMPRESAS.some((e) => e.id === sp.empresa)
      ? sp.empresa
      : "investimentos";
  const empresa = EMPRESAS.find((e) => e.id === empresaId);

  return (
    <ImplementacaoForm empresaId={empresaId} empresaNome={empresa?.nome ?? empresaId} />
  );
}
