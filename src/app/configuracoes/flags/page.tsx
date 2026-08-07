import { redirect } from "next/navigation";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { resolverEstadoDasFlags } from "@/lib/flags/estado";
import { FlagsTabela } from "./flags-tabela";

export const dynamic = "force-dynamic";

/**
 * Configurações › Flags — liga e desliga as flags do Config DB pela tela.
 *
 * NÃO fica atrás de flag própria, ao contrário de `/configuracoes/permissoes`.
 * Seria circular: precisaria de `psql` para ligar a tela cujo propósito é
 * justamente tirar o `psql` do caminho. O gate é só admin.
 */
export default async function FlagsPage() {
  // Gate admin (segurança real; o nav é só cosmético).
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");
  if (!isAdmin(ctx)) redirect("/");

  const flags = await resolverEstadoDasFlags();

  return (
    <div>
      <PageHeader
        title="Flags"
        description="Liga e desliga funcionalidades sem deploy — as chaves da tabela Config."
      />

      <div className="space-y-8 p-8">
        <ComoFunciona
          proposito="Mostra, em uma tela, qual é a configuração deste ambiente: o que está ligado, de onde veio o valor e quando mudou. Antes disso só dava para saber abrindo o banco."
          comoUsar="Vire a chave da flag que quer ligar. As de efeito pesado (escrita, scheduler, controle de acesso) pedem confirmação e explicam o que vai acontecer. A mudança vale na hora, sem redeploy."
          comoAjuda="Tira o psql do caminho crítico de operar o sistema, e deixa registrado quem mudou o quê no log do servidor."
        />

        <FlagsTabela flagsIniciais={flags} />
      </div>
    </div>
  );
}
