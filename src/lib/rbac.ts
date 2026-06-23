import { getConfig } from "@/lib/config-db";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth-helpers";

/**
 * RBAC — Camada 1 (escopo de leitura de clientes).
 *
 * Duas funções:
 *   - `resolverCgesVisiveisPorPessoa(pessoaId)` — núcleo, INDEPENDENTE de sessão
 *     (serve cron/libs que rodam sem cookie).
 *   - `resolverCgesVisiveis(ctx)` — wrapper fino sobre a anterior, a partir do
 *     AuthContext (telas/rotas com sessão).
 * Ambas decidem QUAIS CGEs (CarteiraCge.cge, que casam por VALOR com
 * ClienteBackoffice.assessorCge) o usuário pode ver. Devolvem `string[]`
 * (filtrar por esses CGEs) ou `null` = SEM FILTRO (vê tudo).
 *
 * Postura NÃO-DISRUPTIVA — na dúvida/sem config, NÃO restringe (retorna null);
 * nunca devolve `[]` que zeraria a lista:
 *   - sem Pessoa, ou Pessoa sem papel           -> null (sem filtro)
 *   - papel.adminGlobal, ou escopo "todas"      -> null (sem filtro)
 *   - escopo "propria"                          -> CGEs das carteiras onde é DONO
 *   - escopo "propria_mais_apoio"               -> CGEs das próprias ∪ apoiadas (tipo "apoia")
 *   - escopo restrito que resolve para 0 CGEs   -> null (config incompleta -> sem filtro)
 *
 * A ATIVAÇÃO é gateada pela flag Config DB `RBAC_ENFORCEMENT` (default OFF);
 * `resolverCgesVisiveis` só é chamado quando ela está ON.
 */
export const RBAC_ENFORCEMENT_FLAG = "RBAC_ENFORCEMENT";

function parseBoolFlag(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "on", "yes", "sim"].includes(v.trim().toLowerCase());
}

/** Enforcement de escopo RBAC ligado? Lê a flag do Config DB a cada chamada. Default OFF. */
export async function rbacEnforcementHabilitado(): Promise<boolean> {
  return parseBoolFlag(await getConfig(RBAC_ENFORCEMENT_FLAG));
}

/**
 * NÚCLEO — CGEs visíveis a partir do ID da Pessoa, ou `null` = sem filtro.
 * INDEPENDENTE de sessão (serve cron/libs sem cookie). Ver regra não-disruptiva
 * no topo do arquivo. Mesma resolução de sempre (extraída do wrapper).
 */
export async function resolverCgesVisiveisPorPessoa(pessoaId: string): Promise<string[] | null> {
  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: {
      papel: { select: { adminGlobal: true, escopoOperacional: true } },
      carteirasComoDono: { select: { cges: { select: { cge: true } } } },
      acessosCarteira: {
        where: { tipo: "apoia" },
        select: { carteira: { select: { cges: { select: { cge: true } } } } },
      },
    },
  });

  if (!pessoa?.papel) return null;

  const { adminGlobal, escopoOperacional } = pessoa.papel;
  if (adminGlobal || escopoOperacional === "todas") return null;

  const cges = new Set<string>();
  for (const carteira of pessoa.carteirasComoDono) {
    for (const c of carteira.cges) cges.add(c.cge);
  }
  if (escopoOperacional === "propria_mais_apoio") {
    for (const acesso of pessoa.acessosCarteira) {
      for (const c of acesso.carteira.cges) cges.add(c.cge);
    }
  }

  // Não-disruptivo: config incompleta (0 CGEs) -> sem filtro (vê tudo até configurar).
  if (cges.size === 0) return null;
  return [...cges];
}

/**
 * CGEs visíveis para o usuário logado — wrapper fino sobre
 * `resolverCgesVisiveisPorPessoa`. Sem Pessoa no ctx => null (sem filtro).
 * Comportamento observável IDÊNTICO ao baseline (clientes/page.tsx).
 */
export async function resolverCgesVisiveis(ctx: AuthContext): Promise<string[] | null> {
  if (!ctx.pessoa) return null;
  return resolverCgesVisiveisPorPessoa(ctx.pessoa.id);
}

/**
 * RBAC — Camada 2 (autorização de acesso a UMA ficha por ID).
 *
 * Enquanto a Camada 1 filtra LISTAS, a Camada 2 decide se o usuário pode
 * ABRIR/EDITAR o registro de UM cliente específico. Regra de produto:
 * fora-de-escopo responde como INEXISTENTE (404/notFound) — NUNCA "acesso
 * negado" — pra não vazar a existência do cliente.
 *
 * Estas funções NÃO lançam nem redirecionam: devolvem um booleano e deixam
 * CADA caller montar a resposta no formato dele (page → notFound(); route →
 * 404 JSON). Postura não-disruptiva IDÊNTICA à Camada 1: enforcement OFF, ou
 * `resolverCgesVisiveis` === null (admin / sem papel / escopo "todas" / config
 * incompleta) ⇒ SEMPRE visível (comportamento de hoje, zero 404 novo).
 *
 * Duas formas, pra evitar query dupla:
 *   - `clienteVisivelPorAssessorCge(assessorCge, ctx)` — SEM query; reusa o
 *     `assessorCge` que o caller já carregou (page/route que já fazem
 *     findUnique do cliente).
 *   - `assertClienteVisivel(clienteId, ctx)` — faz a query MÍNIMA (select só
 *     `assessorCge`); pra callers que NÃO carregam o cliente. Cliente
 *     inexistente ⇒ NÃO visível (deixa o 404 "não existe" normal seguir).
 */

/**
 * Filtro de CGEs efetivo pra Camada 2, ou `null` = SEM FILTRO (tudo visível).
 * Colapsa "enforcement OFF" e "resolverCgesVisiveis === null" no mesmo `null`
 * porque ambos levam ao mesmo desfecho: visível. Com enforcement OFF nem
 * resolve a Pessoa (curto-circuito barato, idêntico a hoje).
 */
async function cgesFiltroAtivo(ctx: AuthContext): Promise<string[] | null> {
  if (!(await rbacEnforcementHabilitado())) return null;
  return resolverCgesVisiveis(ctx);
}

/** Visível? — variante SEM query, reusando o assessorCge já em mãos. */
export async function clienteVisivelPorAssessorCge(
  assessorCge: string | null,
  ctx: AuthContext,
): Promise<boolean> {
  const cges = await cgesFiltroAtivo(ctx);
  if (cges === null) return true; // sem filtro — não-disruptivo
  // Restrito: cliente sem assessorCge nunca casa um escopo restrito (cges é
  // sempre não-vazio aqui pela regra não-disruptiva da Camada 1).
  return assessorCge !== null && cges.includes(assessorCge);
}

/** Visível? — variante com query mínima (pra quem não carregou o cliente). */
export async function assertClienteVisivel(
  clienteId: string,
  ctx: AuthContext,
): Promise<{ visivel: boolean }> {
  const cges = await cgesFiltroAtivo(ctx);
  if (cges === null) return { visivel: true };
  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id: clienteId },
    select: { assessorCge: true },
  });
  if (!cliente) return { visivel: false }; // inexistente ⇒ 404 normal segue
  return {
    visivel: cliente.assessorCge !== null && cges.includes(cliente.assessorCge),
  };
}
