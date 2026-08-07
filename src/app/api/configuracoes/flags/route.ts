import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-admin-guard";
import { resolverEstadoDasFlags } from "@/lib/flags/estado";

export const dynamic = "force-dynamic";

/**
 * GET /api/configuracoes/flags — estado de todas as flags do Config DB.
 *
 * Existe porque não havia como perguntar ao app qual é a sua configuração: as
 * flags só se liam abrindo `psql` no banco do ambiente. Agora um curl responde
 * o que está ligado, de onde veio o valor (banco ou env) e quando mudou.
 *
 * ADMIN, não só sessão: a lista revela quais funcionalidades existem antes de
 * serem anunciadas e quais gates de segurança estão ligados — `RBAC_ENFORCEMENT`
 * desligado é informação útil para quem quer abusar do escopo. Mesma régua do
 * resto de /api/configuracoes.
 *
 * Só devolve chaves da allowlist em `lib/flags/registro.ts`. A tabela `Config`
 * guarda segredos (DATACRAZY_TOKEN, ANTHROPIC_API_KEY) na mesma estrutura, e
 * esta rota nunca a varre — busca chave por chave conhecida.
 */
export async function GET() {
  const negado = await guardAdminApi("/api/configuracoes/flags");
  if (negado) return negado;

  const flags = await resolverEstadoDasFlags();

  return NextResponse.json({
    flags,
    // Atalhos para leitura rápida no terminal, sem jq.
    ligadas: flags.filter((f) => f.ligada === true).map((f) => f.key).sort(),
    total: flags.length,
    timestamp: new Date().toISOString(),
  });
}
