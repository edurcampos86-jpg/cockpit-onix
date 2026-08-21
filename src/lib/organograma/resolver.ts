import "server-only";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/rbac-papeis";
import { empresasVisiveis } from "@/lib/empresas/acesso-core";
import { NOS_ECOSSISTEMA } from "@/lib/hub-ecossistema/nos";
import { montarOrganograma, type NoDeclarado, type NoOrganograma } from "./arvore";

/**
 * Organograma — leitura de banco e resolução de acesso.
 *
 * Casca de IO. A régua da árvore está em `arvore.ts` (pura, testada); a régua
 * de quem enxerga o quê está em `lib/empresas/acesso-core.ts` (pura, testada).
 * Aqui só se busca o dado e se junta.
 *
 * ── LÊ O BANCO, NÃO O CATÁLOGO ──────────────────────────────────────────
 * Mesma escolha de `hub-ecossistema/acesso.ts`: o catálogo diz o que DEVERIA
 * estar semeado, `Empresa` diz o que ESTÁ. Uma tela que desenha o catálogo
 * mostraria 20 nós num ambiente onde o seed não rodou — e o cadeado, que
 * depende de linha existir, mentiria junto.
 *
 * ── ROTA SÓ ONDE A PÁGINA EXISTE ────────────────────────────────────────
 * `NOS_ECOSSISTEMA` marca `maturidade: "sem-rota"` para o nó cuja página não
 * foi construída. Levar o clique para lá é entregar um 404 — então esses nós
 * entram na árvore SEM link. Aparecem, são legíveis, e não prometem navegação
 * que não existe.
 *
 * ── FALHA ABERTA, DE PROPÓSITO ──────────────────────────────────────────
 * Erro ao resolver acesso devolve tudo LIBERADO, igual ao hub. Numa tela de
 * navegação, esconder o grupo por causa de uma query que falhou é pior que
 * mostrar um atalho a mais — e o gate de verdade é o de cada página, não este.
 */

/** id → href, só para nó cuja página responde. */
const ROTAS: ReadonlyMap<string, string> = new Map(
  NOS_ECOSSISTEMA.filter((n) => n.maturidade !== "sem-rota").map((n) => [n.id, n.href]),
);

export async function resolverOrganograma(): Promise<NoOrganograma[]> {
  const nos = await lerNos();
  return montarOrganograma(nos, { travados: await idsSemAcesso(), rotas: ROTAS });
}

/** Os nós como estão em `Empresa`, na ordem de exibição do grupo. */
async function lerNos(): Promise<NoDeclarado[]> {
  return prisma.empresa.findMany({
    select: { id: true, nome: true, tipo: true, parentId: true, transversal: true },
    orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { nome: "asc" }],
  });
}

/** Ids a mostrar com cadeado. Vazio = nada travado. */
async function idsSemAcesso(): Promise<Set<string>> {
  const nenhum = new Set<string>();
  try {
    const ctx = await getAuthContext().catch(() => null);
    // Sem Pessoa não há a quem aplicar regra; admin enxerga o grupo inteiro.
    if (!ctx?.pessoa || isAdmin(ctx)) return nenhum;

    const [concessoes, empresas] = await Promise.all([
      prisma.pessoaEmpresa.findMany({
        where: { pessoaId: ctx.pessoa.id },
        select: { empresaId: true, incluiDescendentes: true },
      }),
      prisma.empresa.findMany({ select: { id: true, parentId: true } }),
    ]);

    const visiveis = empresasVisiveis(concessoes, empresas);
    if (visiveis === null) return nenhum; // sem concessão nenhuma ⇒ vê tudo

    return new Set(empresas.map((e) => e.id).filter((id) => !visiveis.has(id)));
  } catch {
    return nenhum;
  }
}
