/**
 * Ensaio da sequência de hierarquia de empresas, ponta a ponta.
 *
 * Roda contra um banco DESCARTÁVEL a mesma ordem que produção vai ver:
 *
 *     migrate deploy → seed → seed-filhas (repetido) → avaria → reparent
 *
 * e falha se qualquer passo divergir do esperado.
 *
 * ── POR QUE EXISTE ───────────────────────────────────────────────────────
 * Essa sequência foi conferida À MÃO antes de cada execução em produção — e
 * conferência manual não sobrevive à próxima pessoa nem ao próximo mês. O que
 * ela verifica não é "o script roda", é o CONTRATO entre as partes: que o seed
 * deixa 6 linhas com as 5 JÁ penduradas, que `seed-filhas` recria só o que
 * falta, que ele NÃO conserta pai errado, e que o reparent conserta. Qualquer
 * um desses quebrando em silêncio só apareceria em produção.
 *
 * ── O QUE MUDOU NA PR-B4 ─────────────────────────────────────────────────
 * Antes, o seed criava tudo solto e o reparent era etapa OBRIGATÓRIA do
 * bootstrap — o ensaio media "o reparent moveu 7?". Agora as filhas nascem
 * penduradas, então num banco novo o reparent não tem o que mover. Para o
 * ensaio continuar exercitando o caminho de reparo (que é o que ele passou a
 * ser), o passo 6 AVARIA a árvore de propósito e só então chama o reparent.
 * Sem essa avaria o ensaio verificaria um caminho que nunca roda.
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
    `seed cria ${ESPERADO_TOTAL} empresas (raiz + ${ESPERADO_FILHAS})`,
    `veio ${depoisDoSeed.length}`,
  );
  conferir(
    depoisDoSeed.some((e) => e.id === RAIZ_DO_GRUPO),
    `a raiz "${RAIZ_DO_GRUPO}" existe`,
    "raiz ausente após o seed",
  );
  conferir(
    depoisDoSeed.find((e) => e.id === RAIZ_DO_GRUPO)?.parentId === null,
    "a raiz nasce sem pai",
    "a raiz nasceu com pai",
  );
  // O contrato da PR-B4: as filhas JÁ nascem penduradas. Antes elas nasciam
  // soltas e só o reparent as pendurava — se isso regredir, a árvore volta a
  // ficar plana depois de um bootstrap limpo e ninguém percebe até olhar.
  const penduradasNoSeed = depoisDoSeed.filter((e) => e.parentId === RAIZ_DO_GRUPO);
  conferir(
    penduradasNoSeed.length === ESPERADO_FILHAS,
    `as ${ESPERADO_FILHAS} filhas nascem JÁ penduradas na raiz`,
    `só ${penduradasNoSeed.length} vieram com parentId="${RAIZ_DO_GRUPO}"`,
  );

  const { validarArvore } = await import("../src/lib/empresas/hierarquia");
  conferir(
    validarArvore(depoisDoSeed).length === 0,
    "a árvore recém-semeada já respeita a régua de 3 níveis",
    validarArvore(depoisDoSeed).map((p) => `${p.id}: ${p.mensagem}`).join("; "),
  );

  // Idempotência do seed.
  rodar(["scripts/seed-empresas.ts"]);
  conferir(
    (await prisma.empresa.count()) === ESPERADO_TOTAL,
    "rodar o seed de novo não duplica",
    "a contagem mudou na segunda execução",
  );

  // ── 3. seed-filhas: cria só o que falta ────────────────────────────────
  //
  // É a lógica que `POST /api/empresas/hierarquia` com { "acao": "seed-filhas" }
  // executa. O ensaio a chama pelo módulo, não pelo HTTP: o que se quer
  // verificar é a ESCRITA contra Postgres de verdade (FK, skipDuplicates,
  // parentId), e isso os testes unitários — que rodam sem banco — não alcançam.
  console.log("\n3. seed-filhas (recria só o que falta)");
  const { planejarSeedFilhas, semearFilhas } = await import(
    "../src/lib/empresas/seed-hierarquia"
  );

  // Apaga dois nós para simular o bootstrap parcial. Precisam ser FOLHAS
  // penduradas na raiz: com 3 níveis, apagar "tech" agora violaria a FK
  // (`tech-qualidade` pendura nele), e a conferência de linha 220 só vale
  // para quem tem `parentId = onix-co`. Os dois departamentos da holding
  // satisfazem as duas condições.
  const apagadas = ["onix-co-expansao", "onix-co-marketing"];
  await prisma.empresa.deleteMany({ where: { id: { in: apagadas } } });
  conferir(
    (await prisma.empresa.count()) === ESPERADO_TOTAL - apagadas.length,
    `${apagadas.length} filhas removidas para simular bootstrap parcial`,
    "a remoção não surtiu efeito",
  );

  const planoParcial = planejarSeedFilhas(await prisma.empresa.findMany({
    select: { id: true, nome: true, tipo: true, transversal: true, consolida: true, parentId: true },
  }));
  conferir(
    [...planoParcial.criar.map((e) => e.id)].sort().join(",") === [...apagadas].sort().join(","),
    "o plano propõe criar EXATAMENTE as que faltam",
    `propôs: ${planoParcial.criar.map((e) => e.id).join(", ")}`,
  );
  conferir(
    planoParcial.divergencias.length === 0,
    "nenhuma divergência de pai no bootstrap parcial",
    `veio ${planoParcial.divergencias.length}`,
  );

  const r1 = await semearFilhas(prisma, planoParcial);
  conferir(
    r1.inseridas === apagadas.length && r1.totalDepois === ESPERADO_TOTAL,
    `seed-filhas recria as ${apagadas.length} ausentes e volta a ${ESPERADO_TOTAL}`,
    `inseridas=${r1.inseridas}, total=${r1.totalDepois}`,
  );
  conferir(
    r1.arvoreFinal
      .filter((e) => apagadas.includes(e.id))
      .every((e) => e.parentId === RAIZ_DO_GRUPO),
    "as recriadas voltam JÁ penduradas na raiz",
    "alguma recriada ficou solta",
  );

  // ── 4. seed-filhas é idempotente ───────────────────────────────────────
  console.log("\n4. seed-filhas repetido (idempotência)");
  for (let volta = 1; volta <= 10; volta++) {
    const plano = planejarSeedFilhas(
      await prisma.empresa.findMany({ select: { id: true, nome: true, tipo: true, transversal: true, consolida: true, parentId: true } }),
    );
    const r = await semearFilhas(prisma, plano);
    if (r.inseridas !== 0 || r.totalDepois !== ESPERADO_TOTAL) {
      throw new Error(
        `FALHOU: seed-filhas não é idempotente\n  volta ${volta}: ` +
          `inseridas=${r.inseridas}, total=${r.totalDepois}`,
      );
    }
  }
  conferir(
    (await prisma.empresa.count()) === ESPERADO_TOTAL,
    `10 execuções seguidas deixam as mesmas ${ESPERADO_TOTAL} linhas`,
    "a contagem mudou ao repetir",
  );

  // ── 5. seed-filhas NÃO conserta pai errado ─────────────────────────────
  //
  // O caso que separa esta operação de um upsert: a filha existe com o pai
  // errado. Consertar aqui seria um UPDATE silencioso em produção disfarçado
  // de seed — o conserto é o verbo do reparent, no passo seguinte.
  console.log("\n5. seed-filhas diante de pai divergente");
  await prisma.empresa.update({ where: { id: "tech" }, data: { parentId: null } });

  const planoDivergente = planejarSeedFilhas(
    await prisma.empresa.findMany({ select: { id: true, nome: true, tipo: true, transversal: true, consolida: true, parentId: true } }),
  );
  conferir(
    planoDivergente.divergencias.length === 1 && planoDivergente.divergencias[0].id === "tech",
    "a filha solta é REPORTADA como divergência",
    `veio ${JSON.stringify(planoDivergente.divergencias)}`,
  );
  conferir(
    planoDivergente.criar.length === 0,
    "a divergente não entra em criar (o INSERT cairia no skipDuplicates)",
    `criar trouxe ${planoDivergente.criar.map((e) => e.id).join(", ")}`,
  );

  const r2 = await semearFilhas(prisma, planoDivergente);
  conferir(
    r2.inseridas === 0 &&
      r2.arvoreFinal.find((e) => e.id === "tech")?.parentId === null,
    "seed-filhas NÃO corrigiu o pai em silêncio",
    "a empresa divergente foi alterada pelo seed",
  );

  // ── 6. Dry-run do reparent NÃO escreve ─────────────────────────────────
  console.log("\n6. reparent (dry-run) sobre a árvore avariada");
  const saidaDry = rodar(["scripts/reparent-empresas.ts"]);
  conferir(
    saidaDry.includes("Nada foi escrito"),
    "dry-run anuncia que não escreveu",
    "a saída não trouxe a frase de dry-run",
  );
  conferir(
    (await prisma.empresa.findUnique({ where: { id: "tech" } }))?.parentId === null,
    "dry-run realmente não escreveu",
    "o dry-run consertou a empresa — ele está escrevendo",
  );

  // ── 7. Aplicar exige autor ─────────────────────────────────────────────
  console.log("\n7. --aplicar sem --como");
  let recusou = false;
  try {
    rodar(["scripts/reparent-empresas.ts", "--aplicar"]);
  } catch {
    recusou = true;
  }
  conferir(recusou, "--aplicar sem --como é recusado", "o script aceitou aplicar sem autor");
  conferir(
    (await prisma.empresa.findUnique({ where: { id: "tech" } }))?.parentId === null,
    "a recusa não deixou escrita parcial",
    "a empresa foi movida mesmo com a recusa",
  );

  // ── 8. Reparent conserta ───────────────────────────────────────────────
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

  console.log("\n8. reparent --aplicar (a ferramenta de reparo)");
  const saidaAplicar = rodar([
    "scripts/reparent-empresas.ts",
    "--aplicar",
    "--como",
    autor.email,
  ]);
  conferir(
    saidaAplicar.includes("Movidas: 1"),
    "o reparent move EXATAMENTE a empresa avariada",
    "a contagem de movidas não foi 1",
  );

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

  // A régua de 3 níveis tem de valer no resultado real, não só na simulação.
  const problemas = validarArvore(depoisDoReparent);
  conferir(
    problemas.length === 0,
    "árvore final respeita a régua de 3 níveis",
    problemas.map((p) => `${p.id}: ${p.mensagem}`).join("; "),
  );

  // ── 9. Auditoria gravou ────────────────────────────────────────────────
  const logs = await prisma.empresaBootstrapLog.findMany({
    where: { acao: "reparent", resultado: "movida" },
    select: { empresaId: true, usuarioId: true },
  });
  conferir(
    logs.length === 1 && logs[0].empresaId === "tech",
    "o reparo deixou 1 linha de auditoria, da empresa certa",
    `veio ${JSON.stringify(logs)}`,
  );
  conferir(
    logs.every((l) => l.usuarioId === autor.id),
    "a linha aponta para o autor informado",
    "a linha veio com autor inesperado",
  );

  // ── 10. Reexecutar o reparent é inócuo ─────────────────────────────────
  console.log("\n9. reparent --aplicar de novo (idempotência)");
  const saidaRepetida = rodar([
    "scripts/reparent-empresas.ts",
    "--aplicar",
    "--como",
    autor.email,
  ]);
  conferir(
    saidaRepetida.includes("Movidas: 0"),
    "num banco são o reparent não tem o que mover",
    "a segunda execução moveu empresas",
  );
  conferir(
    (await prisma.empresa.count()) === ESPERADO_TOTAL,
    `o banco termina com as mesmas ${ESPERADO_TOTAL} linhas`,
    "a contagem final divergiu",
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
