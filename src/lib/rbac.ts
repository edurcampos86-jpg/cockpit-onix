import { getConfig } from "@/lib/config-db";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth-helpers";

/**
 * RBAC — Camada 1 (escopo de leitura de clientes).
 *
 * `resolverCgesVisiveis(ctx)` decide QUAIS CGEs (CarteiraCge.cge, que casam por
 * VALOR com ClienteBackoffice.assessorCge) o usuário logado pode ver. Devolve
 * `string[]` (filtrar por esses CGEs) ou `null` = SEM FILTRO (vê tudo).
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
 * CGEs visíveis para o usuário logado, ou `null` = sem filtro (vê tudo).
 * Ver a regra não-disruptiva no topo do arquivo.
 */
export async function resolverCgesVisiveis(ctx: AuthContext): Promise<string[] | null> {
  if (!ctx.pessoa) return null;

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: ctx.pessoa.id },
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
