import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * Dado INTERNO: criado aqui dentro, editável por quem trabalha aqui dentro.
 *
 * ── A DECISÃO, E POR QUE ELA NÃO É DESCUIDO ──────────────────────────────
 * Cinco rotas de apagamento — lead, indicação, história de storyselling, meta
 * de cliente e evento de vida — ficam abertas a QUALQUER PESSOA LOGADA. Foi
 * decisão nominal do Eduardo em 27/08/2026, e a razão é a natureza do dado:
 *
 *   "São dados criados internamente e editáveis; a maior parte do resto vem do
 *    BTG e é somente leitura de qualquer forma. Não feche essas cinco em admin
 *    — travaria o trabalho do dia."
 *
 * A linha que separa, e vale para o sistema inteiro:
 *
 *   IMPORTAR e EDITAR  → qualquer pessoa logada, relatórios incluídos
 *   EXPORTAR           → só Admin Master
 *   conceder/revogar acesso · flags · apagar em massa → só Admin Master
 *
 * Estas cinco são edição de dado interno, não exportação nem apagamento em
 * massa: cada uma apaga UMA linha, por id, de algo que alguém daqui digitou.
 *
 * ── POR QUE ESTA FUNÇÃO EXISTE, SE O PROXY JÁ EXIGE SESSÃO ───────────────
 * Exigia — por herança, não por escolha. `src/proxy.ts` casa com quase tudo e
 * devolve 401 em `/api/`, então os handlers nunca precisaram perguntar nada. O
 * problema é que "qualquer logado" e "sem checagem nenhuma" se escrevem do
 * mesmo jeito: com nada. Quem lesse o handler não conseguiria distinguir a
 * decisão do esquecimento — e foi exatamente essa ambiguidade que fez a
 * varredura de agosto tratar as cinco como buraco aberto.
 *
 * Aqui a permissividade fica ESCRITA. E deixa de depender de o matcher do proxy
 * continuar cobrindo estas rotas: no dia em que alguém acrescentar uma exceção
 * lá, estas cinco não viram públicas junto.
 *
 * ── O QUE ESTA FUNÇÃO NÃO É ──────────────────────────────────────────────
 * Não é gate de papel. Não olha `role`, não olha `teamRole`, não olha nó do
 * organograma. Se um dia alguma destas rotas precisar de admin, o lugar é
 * `isAdmin` — trocar o corpo daqui mudaria as cinco de uma vez, que é
 * justamente o que não se quer.
 */
export async function exigirSessao(): Promise<NextResponse | null> {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  return null;
}
