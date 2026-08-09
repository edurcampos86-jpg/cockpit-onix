import { NextResponse } from "next/server";
import { guardAdminApi } from "@/lib/api-admin-guard";
import { historicoDaFlag } from "@/lib/flags/estado";
import { FLAGS_REGISTRADAS } from "@/lib/flags/registro";

export const dynamic = "force-dynamic";

/**
 * GET /api/configuracoes/flags/[key]/historico — todas as mudanças de UMA flag.
 *
 * O painel da tela mostra as 5 últimas de qualquer chave; isto responde "esta
 * flag aqui já foi ligada e desligada quantas vezes, e por quem?", que é a
 * pergunta que aparece quando algo começou a se comportar diferente e ninguém
 * lembra quando.
 *
 * ADMIN, igual ao resto de /api/configuracoes.
 *
 * A chave é validada contra a allowlist do registro ANTES da query. `key` vem
 * da URL, então sem isso qualquer nome de chave de `Config` viraria uma consulta
 * — e a resposta traz `de`/`para` com valor cru, que para uma chave de segredo
 * seria vazamento. `FLAGS_REGISTRADAS` (e não `flagAlternavel`) porque flag de
 * VALOR também tem histórico legítimo, ainda que a tela não a alterne.
 */
export async function GET(
  _req: Request,
  ctxParams: { params: Promise<{ key: string }> },
) {
  const negado = await guardAdminApi("/api/configuracoes/flags/[key]/historico");
  if (negado) return negado;

  const { key } = await ctxParams.params;

  if (!FLAGS_REGISTRADAS.some((f) => f.key === key)) {
    console.warn(`[flags] histórico recusado · chave fora do registro: ${key}`);
    return NextResponse.json({ error: "flag_desconhecida", key }, { status: 404 });
  }

  const { mudancas, truncado } = await historicoDaFlag(key);
  return NextResponse.json({ key, mudancas, truncado, total: mudancas.length });
}
