import "server-only";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdmin } from "@/lib/rbac-papeis";
import { empresasVisiveis } from "@/lib/empresas/acesso-core";
import { NOS_ECOSSISTEMA, type NoEcossistemaResolvido } from "@/lib/hub-ecossistema/nos";

/**
 * Hub "Ecossistema Onix" — resolução do estado de ACESSO de cada nó.
 *
 * Ponto de costura ÚNICO entre o hub e o RBAC de empresa. A regra pura mora em
 * `lib/empresas/acesso-core.ts` (com teste, inclusive de ciclo na árvore); aqui
 * fica só a leitura de banco e a tradução para o formato do componente.
 *
 * ── DE ONDE VEM A PERMISSÃO ──────────────────────────────────────────────
 * Da tabela `PessoaEmpresa`, não da hierarquia. `Empresa.parentId` é a árvore
 * SOCIETÁRIA: se ela carregasse permissão, mexer no organograma passaria a
 * conceder e revogar acesso. A árvore só serve para HERDAR, e mesmo isso é
 * opcional por concessão (`incluiDescendentes`).
 *
 * O `NoEcossistema.id` é o mesmo slug de `empresas-config.ts` e de `Empresa.id`
 * — é essa igualdade, coberta por teste em `nos.test.ts`, que faz a junção
 * sair direta.
 *
 * ── POR QUE ISTO NÃO QUEBRA NADA NO DIA DO DEPLOY ────────────────────────
 * `PessoaEmpresa` nasce vazia, e pessoa sem concessão nenhuma vê TUDO
 * (`empresasVisiveis` devolve `null` = sem filtro). Ninguém passa a ver cadeado
 * por omissão; a restrição só começa para quem ganhar uma linha. É a mesma
 * postura não-disruptiva de `resolverCgesVisiveisPorPessoa` no `rbac.ts`.
 *
 * NÃO é gateado por `RBAC_ENFORCEMENT`. Aquela flag é documentada como escopo
 * de leitura de CLIENTES; pendurar o hub nela acoplaria duas coisas sem
 * relação — e obrigaria a ligar o RBAC de clientes inteiro só para conferir um
 * cadeado na tela inicial. Aqui o gate é o próprio dado: sem linha, sem efeito.
 *
 * ── LIMITE, e ele importa ────────────────────────────────────────────────
 * `locked` é ESTADO VISUAL. Não protege rota nenhuma: quem digitar
 * `/empresas/corretora` na barra de endereço não passa por aqui. O gate de
 * verdade continua sendo o de cada página. Esta função decide o que o hub
 * MOSTRA, não o que o sistema PERMITE.
 *
 * Falha fechada ao contrário, de propósito: qualquer erro ao resolver (sem
 * sessão, banco fora, tabela ainda não migrada) devolve tudo LIBERADO. Numa
 * tela de navegação, esconder o grupo inteiro por causa de uma query que falhou
 * é pior que mostrar um atalho a mais — e o acesso real está nas páginas.
 */
export async function resolverNosDoHub(): Promise<NoEcossistemaResolvido[]> {
  const travados = await idsSemAcesso();
  return NOS_ECOSSISTEMA.map((no) => ({ ...no, locked: travados.has(no.id) }));
}

/** Ids de nó a mostrar travados. Vazio = nada travado. */
async function idsSemAcesso(): Promise<Set<string>> {
  const nenhum = new Set<string>();

  try {
    const ctx = await getAuthContext().catch(() => null);
    // Sem sessão ou sem Pessoa vinculada não há a quem aplicar regra. Admin
    // enxerga o grupo inteiro por definição.
    if (!ctx?.pessoa || isAdmin(ctx)) return nenhum;

    const [concessoes, empresas] = await Promise.all([
      prisma.pessoaEmpresa.findMany({
        where: { pessoaId: ctx.pessoa.id },
        select: { empresaId: true, incluiDescendentes: true },
      }),
      prisma.empresa.findMany({ select: { id: true, parentId: true } }),
    ]);

    const visiveis = empresasVisiveis(concessoes, empresas);
    if (visiveis === null) return nenhum; // sem filtro

    return new Set(NOS_ECOSSISTEMA.filter((no) => !visiveis.has(no.id)).map((no) => no.id));
  } catch (erro) {
    console.warn(
      `[hub] falha ao resolver acesso — mostrando tudo liberado: ` +
        `${erro instanceof Error ? erro.message : String(erro)}`,
    );
    return nenhum;
  }
}
