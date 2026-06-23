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
