import "server-only";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { empresasVisiveis } from "@/lib/empresas/acesso-core";
import { sidebarFiltradaHabilitada } from "./flag";
import type { AcessoSidebar } from "./permissoes";

/**
 * Quem está olhando a sidebar — leitura de banco e sessão.
 *
 * Casca de IO. A régua (quem vê o quê) é pura e testada em `permissoes.ts`;
 * aqui só se busca o dado.
 *
 * ── POR QUE NO SERVIDOR, E NÃO NO CLIENTE COMO O GATE ANTIGO ─────────────
 * O gate que existia (`ADMIN_ONLY_HREFS`) roda em `useEffect` com default
 * `false`: todo carregamento desenha a sidebar SEM os itens de admin e depois
 * eles aparecem. Com 4 itens filtrados isso passava; com a régua completa são
 * até 9 itens brotando na tela a cada navegação — o piscar deixaria de ser
 * detalhe e viraria a experiência do menu.
 *
 * Resolvendo aqui, o HTML já sai com a lista certa. Não há segundo render, não
 * há requisição extra, e o servidor é o único lugar que sabe a resposta sem
 * perguntar a ninguém.
 *
 * ── DUAS FALHAS DIFERENTES, DE PROPÓSITO ─────────────────────────────────
 * Se a resolução falhar, cada metade cai para o lado que já era o dela:
 *
 *   CARGO → `false` (fecha). É o comportamento de hoje, e esconder um link de
 *           admin não tira acesso de ninguém: a página tem o próprio redirect.
 *
 *   NÓ    → `null`, que significa SEM RESTRIÇÃO (abre). Não é descuido: `null`
 *           é a convenção de `empresasVisiveis`, e trocá-la por conjunto vazio
 *           esconderia Jurídico, Parceiros e Mídias Sociais de TODO MUNDO por
 *           causa de uma query que falhou — inclusive de quem concede acesso.
 *
 * As duas metades falham para o lado que preserva o estado anterior. É a mesma
 * escolha de `resolverOrganograma`.
 */

/**
 * O fallback quando não dá para saber: cargo FECHADO, nó ABERTO.
 *
 * Os dois campos caem para o lado que preserva o estado anterior — ver o bloco
 * "DUAS FALHAS DIFERENTES" acima. Não confundir com o `null` que
 * `resolverAcessoSidebar` devolve: aquele é "não estou filtrando"; este é
 * "estou filtrando e não descobri quem é".
 */
const NAO_SEI_QUEM_E: AcessoSidebar = { ehAdmin: false, ehLideranca: false, nos: null };

/**
 * `null` quando a flag está DESLIGADA — e a sidebar então se comporta
 * exatamente como antes desta mudança, gate antigo incluído. Não confundir com
 * `NAO_SEI_QUEM_E`: aquele é "filtrando e não descobri quem é"; este `null` é
 * "não estou filtrando".
 */
export async function resolverAcessoSidebar(): Promise<AcessoSidebar | null> {
  if (!(await sidebarFiltradaHabilitada())) return null;

  try {
    const ctx = await getAuthContext().catch(() => null);
    if (!ctx) return NAO_SEI_QUEM_E;

    const ehAdmin = isAdmin(ctx);
    const ehLideranca = ctx.pessoa?.teamRole === "lideranca";

    // Admin enxerga o grupo inteiro por desenho — nem consulta as concessões.
    if (ehAdmin) return { ehAdmin: true, ehLideranca, nos: null };

    // Sem Pessoa não há a quem aplicar concessão. Em 23/08/2026 eram 0 usuários
    // nessa situação, mas o caso existe no schema (`Pessoa.userId` é opcional).
    if (!ctx.pessoa) return { ehAdmin: false, ehLideranca, nos: null };

    const [concessoes, empresas] = await Promise.all([
      prisma.pessoaEmpresa.findMany({
        where: { pessoaId: ctx.pessoa.id },
        select: { empresaId: true, incluiDescendentes: true },
      }),
      prisma.empresa.findMany({ select: { id: true, parentId: true } }),
    ]);

    return { ehAdmin: false, ehLideranca, nos: empresasVisiveis(concessoes, empresas) };
  } catch {
    return NAO_SEI_QUEM_E;
  }
}
