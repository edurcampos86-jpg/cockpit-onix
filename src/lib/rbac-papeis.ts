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
   * e-mail — só `AuthContext` tem. Enquanto o fallback de bootstrap existir, é
   * ele que permite reconhecer o Admin Master antes do `UPDATE` no banco; onde
   * o e-mail não está disponível, `isAdminMaster` cai para `role === "master"`.
   */
  email?: string | null;
  /** Registro de time, quando existe. `teamRole`: "admin" | "lideranca" | "colaborador". */
  pessoa: { teamRole: string } | null;
};

/**
 * O e-mail do único Admin Master — FALLBACK TEMPORÁRIO DE BOOTSTRAP.
 *
 * ── POR QUE ELE EXISTE ───────────────────────────────────────────────────
 * O Admin Master é guardado em `User.role = "master"`, que é um dado, não
 * código. Se o gate fosse estritamente `role === "master"` e o `UPDATE` ainda
 * não tivesse rodado, o merge desta mudança removeria NA HORA a capacidade de
 * conceder acesso e ligar flags — de todo mundo, inclusive de quem deveria ser
 * o master. E o procedimento de quebra-vidro está adiado por decisão do
 * Eduardo, então não haveria caminho de volta pela tela.
 *
 * Com o fallback, a ORDEM entre o `UPDATE` e o merge deixa de importar. É a
 * escolha dele, nestas palavras: "escolho o FALLBACK... sem quebra-vidro, não
 * vou correr risco de lockout."
 *
 * ── POR QUE ELE PRECISA SAIR ─────────────────────────────────────────────
 * Identidade em constante é autorização que não se revoga sem deploy. Assim que
 * o `UPDATE User SET role = 'master'` estiver confirmado no banco, sai daqui em
 * PR própria e o gate fica estrito. A pendência está registrada no corpo da PR
 * que introduziu isto.
 */
const EMAIL_MASTER = "edurcampos86@gmail.com";

/**
 * Admin Master — o nível acima de admin, com poderes que NENHUM admin comum
 * tem: exportar dados, conceder e revogar acesso, ligar e desligar flags,
 * apagar em massa.
 *
 * Reconhece por `User.role === "master"` OU pelo e-mail do titular único (o
 * fallback acima). A comparação de e-mail normaliza caixa e espaços porque o
 * cadastro não garante nenhum dos dois.
 */
export function isAdminMaster(ctx: PerfilAcesso): boolean {
  if (ctx.role === "master") return true;
  const email = (ctx.email ?? "").trim().toLowerCase();
  return email !== "" && email === EMAIL_MASTER;
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
