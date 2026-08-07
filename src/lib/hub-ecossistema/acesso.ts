import "server-only";
import { NOS_ECOSSISTEMA, type NoEcossistemaResolvido } from "@/lib/hub-ecossistema/nos";

/**
 * Hub "Ecossistema Onix" — resolução do estado de ACESSO de cada nó.
 *
 * Ponto de costura ÚNICO entre o hub e o RBAC. Hoje devolve tudo liberado
 * (`locked: false` estático, como combinado nesta fase); quando o RBAC de
 * empresa existir, ele entra AQUI e mais em lugar nenhum — o componente já
 * consome `locked` e não precisa mudar uma linha.
 *
 * É `server-only` desde já, mesmo sem tocar em banco ainda, porque o corpo
 * definitivo vai chamar `getAuthContext()` (que é `server-only`) e Prisma. Sem
 * a marca, alguém importaria isto de um componente `'use client'` hoje e só
 * descobriria o problema no dia em que a função virasse real.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TODO(RBAC) — ligar no RBAC existente quando houver mapeamento empresa→permissão
 * ─────────────────────────────────────────────────────────────────────────
 * O que JÁ existe (`src/lib/rbac.ts`) resolve escopo de CLIENTE por CGE:
 *   • `rbacEnforcementHabilitado()` — flag `RBAC_ENFORCEMENT`, default OFF;
 *   • `resolverCgesVisiveis(ctx)`   — `string[]` de CGEs ou `null` = vê tudo;
 *   • `assertClienteVisivel(id, ctx)` — autorização de UMA ficha.
 * Nenhuma delas responde "esta PESSOA pode entrar na empresa X" — a granularidade
 * é CGE de carteira, não empresa do grupo. Essa é exatamente a peça que falta.
 *
 * Quando ela existir, o corpo desta função vira:
 *
 *   1. `if (!(await rbacEnforcementHabilitado())) return tudoLiberado();`
 *      Postura NÃO-DISRUPTIVA idêntica à do resto do RBAC: enforcement OFF ⇒
 *      nada bloqueado, o hub segue como hoje.
 *   2. `const ctx = await getAuthContext();`
 *      `if (isAdmin(ctx)) return tudoLiberado();`  (`@/lib/rbac-papeis`)
 *   3. Resolver as empresas permitidas para `ctx.pessoa` e marcar
 *      `locked: !permitidas.has(no.id)`. `NoEcossistema.id` foi escolhido igual
 *      ao `EmpresaConfig.id` de `empresas-config.ts` justamente para essa
 *      junção sair direta (`investimentos`, `corretora`, `imobiliaria`,
 *      `corporate`, `tech`, `educacao`); `agro` e `contabil` ainda não têm
 *      contraparte e precisarão ser criados lá primeiro.
 *   4. Na dúvida (sem Pessoa, sem papel, config incompleta) devolver LIBERADO,
 *      nunca bloqueado — é a mesma regra não-disruptiva do `rbac.ts`, e aqui
 *      um falso bloqueio esconde a empresa inteira do dono do grupo.
 *
 * Fora de escopo desta função: `locked` é só ESTADO VISUAL. Ele não protege
 * rota nenhuma — quem digitar `/empresas/corretora` na barra de endereço não
 * passa por aqui. O gate de verdade continua sendo o de cada página/rota.
 */
export async function resolverNosDoHub(): Promise<NoEcossistemaResolvido[]> {
  return NOS_ECOSSISTEMA.map((no) => ({ ...no, locked: false }));
}
