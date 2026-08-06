import { getAuthContext } from "@/lib/auth-helpers";
import {
  EMPRESAS_IMPLEMENTACOES,
  empresaAceitaImplementacao,
  nomeEmpresa,
} from "@/lib/empresas-config";
import { ImplementacaoForm } from "./implementacao-form";

export const dynamic = "force-dynamic";

export default async function NovaImplementacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  await getAuthContext(); // exige login

  const sp = await searchParams;
  // ?empresa= vem de link externo (aba "Melhorias" de cada empresa) — só é
  // aceito se for alvo da fase atual; qualquer outro valor cai no padrão.
  const empresaId =
    sp.empresa && empresaAceitaImplementacao(sp.empresa)
      ? sp.empresa
      : EMPRESAS_IMPLEMENTACOES[0].id;

  return (
    <ImplementacaoForm
      empresaId={empresaId}
      empresaNome={nomeEmpresa(empresaId)}
    />
  );
}
