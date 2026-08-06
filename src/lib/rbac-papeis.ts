/**
 * Régua de PAPÉIS do Cockpit — módulo PURO.
 *
 * Separado de `rbac.ts` (que é o escopo de leitura de clientes por CGE, e
 * depende de Prisma) e de `auth-helpers.ts` (que abre com `import "server-only"`
 * e por isso não carrega no test runner — `tsx --test` explode no import).
 * Resultado prático de antes: a decisão de autorização mais sensível do sistema
 * não tinha como ter teste automatizado.
 *
 * Aqui é só o predicado: sem sessão, sem Prisma, sem `server-only`.
 * `auth-helpers.ts` re-exporta `isAdmin`/`isLideranca` daqui, então nenhum
 * chamador existente muda — quem importa de `@/lib/auth-helpers` segue igual.
 */

/**
 * O mínimo que a régua precisa. `AuthContext` (auth-helpers) satisfaz este
 * formato estruturalmente — o tipo é mais largo de propósito, para que módulos
 * puros possam decidir sem arrastar a dependência de sessão junto.
 */
export type PerfilAcesso = {
  /** `User.role` — "admin" | "support". */
  role: string;
  /** Registro de time, quando existe. `teamRole`: "admin" | "lideranca" | "colaborador". */
  pessoa: { teamRole: string } | null;
};

/** Admin é quem tem `User.role === "admin"` OU `Pessoa.teamRole === "admin"`. */
export function isAdmin(ctx: PerfilAcesso): boolean {
  return ctx.role === "admin" || ctx.pessoa?.teamRole === "admin";
}

/** Liderança = admin OU pessoa com `teamRole === "lideranca"`. */
export function isLideranca(ctx: PerfilAcesso): boolean {
  return isAdmin(ctx) || ctx.pessoa?.teamRole === "lideranca";
}
