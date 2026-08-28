/**
 * Promove UM usuário a Admin Master — `User.role = "master"`.
 *
 * ── POR QUE UM SCRIPT COM BOTÃO, E NÃO UM UPDATE NO PSQL ─────────────────
 * As sessões de agente não alcançam o banco de produção (`CONNECT 403`), e o
 * Eduardo não tem acesso confortável ao psql. Sem este caminho, o passo que
 * destrava o Admin Master ficaria esperando alguém abrir um terminal — e o
 * passo que ninguém consegue executar é o passo que fica para depois. Mesmo
 * motivo do `seed-empresas`, e mesmo molde.
 *
 * ── O QUE ELE FAZ, E SÓ ISSO ─────────────────────────────────────────────
 * `UPDATE "User" SET role = 'master' WHERE email = <alvo>`. Uma linha, um
 * campo. Não cria usuário, não mexe em `Pessoa`, não toca em papel nenhum além
 * do `role` daquele e-mail.
 *
 * ── AS TRAVAS ────────────────────────────────────────────────────────────
 *   1. DRY-RUN por padrão. Sem `--aplicar`, lê e mostra, não escreve.
 *   2. O e-mail alvo é ARGUMENTO, não constante: o workflow o passa, e o
 *      resumo do job registra qual foi.
 *   3. Recusa se o e-mail não existir, ou se casar com mais de um usuário —
 *      um `UPDATE` que promove dois é pior que um que não promove nenhum.
 *   4. Idempotente: se já for master, diz e não escreve.
 *   5. Confere DEPOIS, relendo do banco, e falha se o papel não ficou
 *      `master`. "Aplicou" sem conferir é fé, não verificação.
 *
 * ── O QUE ACONTECE DEPOIS ────────────────────────────────────────────────
 * Com o papel gravado, o fallback por e-mail em `lib/rbac-papeis.ts` deixa de
 * ser necessário e sai em PR própria — é a pendência registrada na PR que o
 * introduziu. Enquanto ele existir, rodar isto não muda o acesso do Eduardo:
 * muda a FONTE do acesso, de constante no código para dado no banco.
 */

import "dotenv/config";

/** Host de destino SEM credencial — a URL do Postgres carrega usuário e senha. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

let aberto: { $disconnect: () => Promise<void> } | null = null;

const OK = 0;
const RECUSADO = 1;

/** Mostra o e-mail sem publicá-lo por extenso no log de um repositório PÚBLICO. */
function mascarar(email: string): string {
  const [local, dominio] = email.split("@");
  if (!dominio) return "(e-mail malformado)";
  const visivel = local.slice(0, 2);
  return `${visivel}${"*".repeat(Math.max(1, local.length - 2))}@${dominio}`;
}

async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL não está definida.");
    return RECUSADO;
  }

  const args = process.argv.slice(2);
  const aplicar = args.includes("--aplicar");
  const alvo = (args.find((a) => a.startsWith("--email="))?.slice("--email=".length) ?? "")
    .trim()
    .toLowerCase();

  if (!alvo) {
    console.error("Falta --email=<endereço>. Nada foi lido nem escrito.");
    return RECUSADO;
  }

  console.log("PROMOVER A ADMIN MASTER");
  console.log(`Destino: ${descreverDestino(url)}`);
  console.log(`Alvo:    ${mascarar(alvo)}`);
  console.log(`Modo:    ${aplicar ? "APLICAR (escreve)" : "DRY-RUN (não escreve)"}\n`);

  const { prisma } = await import("../src/lib/prisma");
  aberto = prisma;

  /* ── 1. QUEM É O ALVO ────────────────────────────────────────────────── */

  /* Casa por e-mail normalizado. `citext` não está em uso, então a comparação
   * é feita em minúsculas nos dois lados — senão um cadastro com maiúscula
   * faria o script dizer "não existe" sobre um usuário que existe. */
  const candidatos = await prisma.$queryRaw<Array<{ id: string; role: string; email: string }>>`
    SELECT "id", "role", "email"
    FROM "User"
    WHERE lower("email") = ${alvo}
  `;

  if (candidatos.length === 0) {
    console.error(`NENHUM usuário com este e-mail. Nada a fazer.`);
    console.error("Confira o endereço — o script não cria usuário.");
    return RECUSADO;
  }
  if (candidatos.length > 1) {
    console.error(`${candidatos.length} usuários com o MESMO e-mail. RECUSADO.`);
    console.error("Promover dois é pior que não promover nenhum — resolva a duplicata antes.");
    return RECUSADO;
  }

  const alvoUnico = candidatos[0];
  console.log("── ANTES ──");
  console.log(`  usuários com este e-mail   1`);
  console.log(`  role atual                 ${alvoUnico.role}`);

  if (alvoUnico.role === "master") {
    console.log("\n  Já é master. Nada a escrever — o script é idempotente.");
    return OK;
  }

  /* ── 2. QUANTOS MASTERS EXISTEM HOJE ─────────────────────────────────── */

  const [antes] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(*) AS total FROM "User" WHERE "role" = 'master'
  `;
  console.log(`  masters já existentes      ${Number(antes.total)}`);
  if (Number(antes.total) > 0) {
    console.log("\n  ATENÇÃO: já existe master. O Eduardo declarou ser o TITULAR ÚNICO —");
    console.log("  se este número for maior que zero depois desta execução, alguém a mais");
    console.log("  tem os quatro poderes exclusivos. Não é motivo para recusar aqui, mas é");
    console.log("  motivo para olhar.");
  }

  if (!aplicar) {
    console.log("\n── PLANO ──");
    console.log(`  UPDATE "User" SET role = 'master' WHERE id = <o único que casou>`);
    console.log("  1 linha afetada. Nenhum outro campo, nenhuma outra tabela.");
    console.log("\n  DRY-RUN: nada foi escrito.");
    return OK;
  }

  /* ── 3. APLICAR ──────────────────────────────────────────────────────── */

  /* Por `id`, não por e-mail: o `id` veio da leitura acima, que já provou ser
   * único. Repetir o `WHERE email` abriria a janela de um segundo usuário com
   * o mesmo endereço ter sido criado entre a checagem e a escrita. */
  const afetadas = await prisma.$executeRaw`
    UPDATE "User" SET "role" = 'master' WHERE "id" = ${alvoUnico.id}
  `;
  console.log(`\n── APLICADO ──`);
  console.log(`  linhas afetadas            ${afetadas}`);

  /* ── 4. CONFERIR, RELENDO ────────────────────────────────────────────── */

  const [depois] = await prisma.$queryRaw<Array<{ role: string }>>`
    SELECT "role" FROM "User" WHERE "id" = ${alvoUnico.id}
  `;
  const [masters] = await prisma.$queryRaw<Array<{ total: bigint }>>`
    SELECT count(*) AS total FROM "User" WHERE "role" = 'master'
  `;

  console.log("\n── DEPOIS ──");
  console.log(`  role lido do banco         ${depois?.role ?? "(sumiu)"}`);
  console.log(`  total de masters           ${Number(masters.total)}`);

  if (depois?.role !== "master") {
    console.error("\nFALHOU: o papel não ficou 'master'. Nada a comemorar.");
    return RECUSADO;
  }

  console.log("\n  OK. O Admin Master agora vem do BANCO, não da constante do código.");
  console.log("  Próximo passo: a PR que remove o fallback `EMAIL_MASTER`.");
  return OK;
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exitCode = RECUSADO;
  })
  .finally(() => aberto?.$disconnect());
