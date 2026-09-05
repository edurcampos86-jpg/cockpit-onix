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
  /** `User.role` — "admin" | "support" | "master". */
  role: string;
  /**
   * `User.email`. OPCIONAL porque `SessionPayload` (o JWT do cookie) não carrega
   * e-mail — só `AuthContext` tem.
   *
   * NENHUMA decisão deste módulo olha para ele desde que o fallback de
   * bootstrap saiu (29/08/2026): papel é papel, e-mail é identificação. O campo
   * fica porque `AuthContext` o traz e satisfazer o formato não deve custar um
   * cast a quem chama — e porque tirá-lo não deixaria o gate mais estrito do
   * que já está.
   */
  email?: string | null;
  /** Registro de time, quando existe. `teamRole`: "admin" | "lideranca" | "colaborador". */
  pessoa: { teamRole: string } | null;
};

/**
 * Admin Master — o nível acima de admin, com poderes que NENHUM admin comum
 * tem: exportar dados, conceder e revogar acesso, ligar e desligar flags,
 * apagar em massa.
 *
 * ── O GATE É ESTRITO: SÓ `User.role === "master"` ────────────────────────
 * Até 29/08/2026 havia um segundo caminho — uma constante com o e-mail do
 * titular — que existia para uma janela específica: enquanto o
 * `UPDATE User SET role='master'` não tivesse rodado, um gate estrito teria
 * tirado de TODO MUNDO a capacidade de conceder acesso e ligar flags, sem
 * quebra-vidro para voltar. O fallback fazia a ORDEM entre o `UPDATE` e o
 * merge não importar.
 *
 * Essa janela FECHOU: o `UPDATE` rodou em produção pelo workflow
 * `promover-master` (run #33255730835, 29/08/2026 — "role lido do banco:
 * master, total de masters: 1"), e o próprio script pediu esta PR.
 *
 * Sai porque identidade em constante é autorização que não se revoga sem
 * deploy: para tirar o poder de quem está no código é preciso um merge, e
 * quem lê a linha não descobre quem manda hoje — descobre quem mandava quando
 * alguém compilou. Com o gate estrito, conceder e revogar viram o que sempre
 * deveriam ter sido: um `UPDATE` em uma linha, auditável e reversível.
 */
export function isAdminMaster(ctx: PerfilAcesso): boolean {
  return ctx.role === "master";
}

/**
 * Admin é quem tem `User.role === "admin"` OU `Pessoa.teamRole === "admin"` —
 * **ou é Admin Master**.
 *
 * O master entra aqui porque é SUPERCONJUNTO, não papel paralelo: quem pode
 * conceder acesso a todo mundo tem, por definição, o que um admin comum tem.
 * Sem esta linha, criar o master REMOVERIA acesso de quem o recebesse — o papel
 * novo passaria a falhar em todo `isAdmin` do sistema, e são 76 chamadas.
 */
export function isAdmin(ctx: PerfilAcesso): boolean {
  return isAdminMaster(ctx) || ctx.role === "admin" || ctx.pessoa?.teamRole === "admin";
}

/** Liderança = admin OU pessoa com `teamRole === "lideranca"`. */
export function isLideranca(ctx: PerfilAcesso): boolean {
  return isAdmin(ctx) || ctx.pessoa?.teamRole === "lideranca";
}
