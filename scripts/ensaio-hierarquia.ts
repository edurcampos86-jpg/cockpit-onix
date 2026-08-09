/**
 * Ensaio da sequência de hierarquia de empresas, ponta a ponta.
 *
 * Roda contra um banco DESCARTÁVEL a mesma ordem que produção vai ver:
 *
 *     migrate deploy → seed → reparent (dry-run) → reparent --aplicar → reexecutar
 *
 * e falha se qualquer passo divergir do esperado.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────
 * Essa sequência foi conferida À MÃO antes de cada execução em produção — e
 * conferência manual não sobrevive à próxima pessoa nem ao próximo mês. O que
 * ela verifica não é "o script roda", é o CONTRATO entre os três: que o seed
 * deixa 8 raízes soltas, que o dry-run não escreve, que o `--aplicar` move 7, e
 * que reexecutar não move nada. Qualquer um desses quebrando em silêncio só
 * apareceria em produção.
 *
 * ── SEGURANÇA: NUNCA CONTRA UM BANCO QUE NÃO SEJA DESCARTÁVEL ────────────
 * Este script APAGA e recria o banco de destino. Por isso ele recusa qualquer
 * URL que não seja localhost, e exige que o nome do banco comece com
 * `ensaio_`. As duas checagens são redundantes de propósito: a primeira barra
 * o host errado, a segunda barra apontar para o banco de dev local por engano.
 *
 * ── NÃO É TESTE UNITÁRIO ─────────────────────────────────────────────────
 * Fica fora de `npm test` (que roda `src/**​/*.test.ts` sem banco). É ensaio de
 * integração: precisa de Postgres e leva dezenas de segundos.
 *
 * Como rodar:
 *   createdb ensaio_hierarquia
 *   DATABASE_URL="postgresql://.../ensaio_hierarquia" npx tsx scripts/ensaio-hierarquia.ts
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { RAIZ_DO_GRUPO, idsCadastradas, idsFilhasDaRaiz } from "../src/lib/empresas/catalogo";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

const ESPERADO_TOTAL = idsCadastradas().length; // raiz + as cadastradas
const ESPERADO_FILHAS = idsFilhasDaRaiz().length;

/** Falha o ensaio com uma mensagem que diz o que se esperava e o que veio. */
function conferir(condicao: boolean, oQue: string, detalhe: string): void {
  if (condicao) {
    console.log(`  ok    ${oQue}`);
    return;
  }
  throw new Error(`FALHOU: ${oQue}\n  ${detalhe}`);
}

/** Roda um script do repo e devolve a saída, sem herdar stdout. */
function rodar(args: string[]): string {
  return execFileSync("npx", ["tsx", ...args], {
    encoding: "utf8",
    env: process.env,
    // O reparent sai com código 1 quando a árvore fica fora da régua; deixamos
    // o erro subir para o ensaio falhar junto.
  });
}

/**
 * Recusa destino que não seja descartável.
 *
 * Duas barreiras independentes: host e nome do banco. Uma URL de produção
 * dificilmente passaria na primeira, mas o caso REAL que preocupa é outro —
 * apontar sem querer para o `cockpit_dev` da própria máquina, que é localhost e
 * passaria. O prefixo `ensaio_` é o que barra isso.
 */
function exigirBancoDescartavel(url: string): { banco: string } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("DATABASE_URL não é uma URL válida.");
  }

  const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  if (!local) {
    throw new Error(
      `Destino "${u.hostname}" não é local. Este ensaio APAGA o banco — ele só roda\n` +
        "  contra localhost. Nunca aponte para Railway nem para qualquer host remoto.",
    );
  }

  const banco = u.pathname.replace(/^\//, "");
  if (!banco.startsWith("ensaio_")) {
    throw new Error(
      `O banco "${banco}" não começa com "ensaio_". Este script APAGA todas as\n` +
        "  tabelas do destino; o prefixo é o que impede apontar para o seu banco de\n" +
        "  dev por engano. Crie um: createdb ensaio_hierarquia",
    );
  }

  return { banco };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Ex.:\n" +
        '  DATABASE_URL="postgresql://postgres:senha@localhost:5432/ensaio_hierarquia" \\\n' +
        "    npx tsx scripts/ensaio-hierarquia.ts",
    );
  }

  const { banco } = exigirBancoDescartavel(url);
  console.log(`Ensaio da hierarquia de empresas — banco descartável "${banco}"\n`);

  // ── 1. Schema do zero ──────────────────────────────────────────────────
  console.log("1. migrate deploy");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { encoding: "utf8", env: process.env });
  console.log("  ok    chain de migrations aplicada\n");

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const totalInicial = await prisma.empresa.count();
  conferir(
    totalInicial === 0,
    "banco começa com Empresa vazia",
    `veio ${totalInicial} linha(s) — o banco não estava limpo`,
  );

  // ── 2. Seed ────────────────────────────────────────────────────────────
  console.log("\n2. seed-empresas");
  rodar(["scripts/seed-empresas.ts"]);

  const depoisDoSeed = await prisma.empresa.findMany({ select: { id: true, parentId: true } });
  conferir(
    depoisDoSeed.length === ESPERADO_TOTAL,
    `seed cria ${ESPERADO_TOTAL} empresas`,
    `veio ${depoisDoSeed.length}`,
  );
  conferir(
    depoisDoSeed.every((e) => e.parentId === null),
    "todas nascem como raízes soltas",
    `${depoisDoSeed.filter((e) => e.parentId !== null).length} já tinham pai`,
  );
  conferir(
    depoisDoSeed.some((e) => e.id === RAIZ_DO_GRUPO),
    `a raiz "${RAIZ_DO_GRUPO}" existe`,
    "raiz ausente após o seed",
  );

  // Idempotência do seed.
  rodar(["scripts/seed-empresas.ts"]);
  conferir(
    (await prisma.empresa.count()) === ESPERADO_TOTAL,
    "rodar o seed de novo não duplica",
    "a contagem mudou na segunda execução",
  );

  // ── 3. Dry-run NÃO escreve ─────────────────────────────────────────────
  console.log("\n3. reparent (dry-run)");
  const saidaDry = rodar(["scripts/reparent-empresas.ts"]);
  conferir(
    saidaDry.includes("Nada foi escrito"),
    "dry-run anuncia que não escreveu",
    "a saída não trouxe a frase de dry-run",
  );
  const comPaiAposDry = await prisma.empresa.count({ where: { parentId: { not: null } } });
  conferir(
    comPaiAposDry === 0,
    "dry-run realmente não escreveu",
    `${comPaiAposDry} empresa(s) ganharam pai — o dry-run está escrevendo`,
  );

  // ── 4. Aplicar exige autor ─────────────────────────────────────────────
  console.log("\n4. --aplicar sem --como");
  let recusou = false;
  try {
    rodar(["scripts/reparent-empresas.ts", "--aplicar"]);
  } catch {
    recusou = true;
  }
  conferir(recusou, "--aplicar sem --como é recusado", "o script aceitou aplicar sem autor");
  conferir(
    (await prisma.empresa.count({ where: { parentId: { not: null } } })) === 0,
    "a recusa não deixou escrita parcial",
    "alguma empresa foi movida mesmo com a recusa",
  );

  // ── 5. Aplicar de verdade ──────────────────────────────────────────────
  // O log tem FK obrigatória para User: o ensaio cria um autor descartável.
  // É a ÚNICA linha que este script insere fora do que os scripts testados
  // criam, e ela existe porque sem autor não dá para exercitar o caminho de
  // auditoria — que é justamente o que se quer verificar.
  const autor = await prisma.user.create({
    data: {
      name: "Ensaio",
      cpf: "00000000191",
      email: "ensaio@exemplo.invalid",
      password: "nao-usado",
    },
    select: { id: true, email: true },
  });

  console.log("\n5. reparent --aplicar");
  rodar(["scripts/reparent-empresas.ts", "--aplicar", "--como", autor.email]);

  const depoisDoReparent = await prisma.empresa.findMany({ select: { id: true, parentId: true } });
  const filhas = depoisDoReparent.filter((e) => e.parentId === RAIZ_DO_GRUPO);
  conferir(
    filhas.length === ESPERADO_FILHAS,
    `${ESPERADO_FILHAS} empresas penduradas na raiz`,
    `veio ${filhas.length}`,
  );
  conferir(
    depoisDoReparent.find((e) => e.id === RAIZ_DO_GRUPO)?.parentId === null,
    "a raiz continua raiz",
    "a raiz ganhou pai",
  );

  // A régua de 2 níveis tem de valer no resultado real, não só na simulação.
  const { validarArvore } = await import("../src/lib/empresas/hierarquia");
  const problemas = validarArvore(depoisDoReparent);
  conferir(
    problemas.length === 0,
    "árvore final respeita a régua de 2 níveis",
    problemas.map((p) => `${p.id}: ${p.mensagem}`).join("; "),
  );

  // ── 6. Auditoria gravou ────────────────────────────────────────────────
  const logs = await prisma.empresaBootstrapLog.findMany({
    where: { acao: "reparent" },
    select: { empresaId: true, resultado: true, usuarioId: true },
  });
  conferir(
    logs.length === ESPERADO_FILHAS,
    `${ESPERADO_FILHAS} linha(s) de auditoria gravadas`,
    `veio ${logs.length}`,
  );
  conferir(
    logs.every((l) => l.usuarioId === autor.id && l.resultado === "movida"),
    "cada linha aponta para o autor informado",
    "alguma linha veio com autor ou resultado inesperado",
  );

  // ── 7. Reexecutar é inócuo ─────────────────────────────────────────────
  console.log("\n6. reparent --aplicar de novo (idempotência)");
  const saidaRepetida = rodar([
    "scripts/reparent-empresas.ts",
    "--aplicar",
    "--como",
    autor.email,
  ]);
  conferir(
    saidaRepetida.includes("Movidas: 0"),
    "segunda execução não move nada",
    "a segunda execução moveu empresas",
  );
  const logsDepois = await prisma.empresaBootstrapLog.count({ where: { acao: "reparent" } });
  conferir(
    logsDepois === ESPERADO_FILHAS + 1,
    "execução sem movimento também deixa rastro",
    `esperava ${ESPERADO_FILHAS + 1} linha(s), veio ${logsDepois}`,
  );

  console.log("\n═══ ENSAIO COMPLETO — todos os contratos verificados ═══");
}

main()
  .catch((e) => {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
