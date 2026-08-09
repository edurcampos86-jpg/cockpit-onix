/**
 * Reparenting da tabela `Empresa` — pendura as empresas do grupo na raiz.
 *
 * É a "PR seguinte" que `scripts/seed-empresas.ts` anuncia: o seed cria as 8
 * como raízes soltas de propósito e deixa o vínculo para cá, com conferência
 * antes do UPDATE.
 *
 * ── DRY-RUN POR PADRÃO ───────────────────────────────────────────────────
 * Sem `--aplicar` este script NÃO escreve nada: lê o estado, valida a mudança
 * proposta contra a régua de `src/lib/empresas/hierarquia.ts` e imprime o plano.
 * É a mesma postura de `implementacoes-anexos-orfaos`, e pelo mesmo motivo: a
 * mudança aqui altera quem herda acesso a quê (`PessoaEmpresa.incluiDescendentes`),
 * então ver antes de aplicar não é cerimônia.
 *
 * ── VALIDA CADA MOVIMENTO, NÃO SÓ O CONJUNTO ─────────────────────────────
 * `validarParent` roda para cada empresa ANTES do UPDATE dela, sobre o estado
 * corrente. Uma que falhe é PULADA, não aborta as demais — e o motivo é
 * impresso. No fim, `validarArvore` audita o resultado inteiro: se sobrar
 * qualquer nó fora da régua, o script sai com código 1.
 *
 * ── O QUE NÃO FAZ ────────────────────────────────────────────────────────
 * Não cria empresa (isso é o seed), não renomeia, não apaga, e não toca em
 * `PessoaEmpresa`. Empresa que não existir no banco é reportada e ignorada.
 *
 * Como rodar:
 *   npx tsx scripts/reparent-empresas.ts              # só mostra o plano
 *   npx tsx scripts/reparent-empresas.ts --aplicar    # executa
 */
import "dotenv/config";
import { RAIZ_DO_GRUPO, idsFilhasDaRaiz } from "../src/lib/empresas/catalogo";

let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/** A raiz. Mesmo id de `scripts/seed-empresas.ts` e do catálogo. */
const RAIZ = RAIZ_DO_GRUPO;

/**
 * Quem passa a pendurar na raiz. É a lista do catálogo MENOS a própria raiz —
 * repetida aqui de propósito em vez de só importada: este script move dado de
 * produção, e a lista do que vai ser movido tem de estar VISÍVEL no arquivo que
 * move, não a um import de distância. Ler o import não é ler a lista.
 *
 * O que o import faz é impedir que a cópia envelheça: `conferirContraCatalogo`
 * aborta antes de qualquer UPDATE se as duas divergirem. Visibilidade e
 * verdade única deixam de ser escolha — dá para ter as duas.
 */
const FILHAS = [
  "investimentos",
  "corretora",
  "planejamento",
  "imobiliaria",
  "corporate",
  "tech",
  "educacao",
] as const;

/**
 * Aborta se a lista acima divergir do catálogo.
 *
 * Roda ANTES do primeiro UPDATE, inclusive em dry-run: um dry-run que valida a
 * lista errada dá um "plano aprovado" falso, e é justamente o plano que autoriza
 * o `--aplicar`. Divergência aqui é sempre erro humano de sincronia — nunca é
 * "só a produção estar diferente".
 */
function conferirContraCatalogo(): void {
  const doCatalogo = idsFilhasDaRaiz();
  const faltando = doCatalogo.filter((id) => !FILHAS.includes(id as (typeof FILHAS)[number]));
  const sobrando = FILHAS.filter((id) => !doCatalogo.includes(id));

  if (faltando.length === 0 && sobrando.length === 0) return;

  throw new Error(
    "A lista FILHAS deste script divergiu de src/lib/empresas/catalogo.ts.\n" +
      (faltando.length ? `  faltando aqui: ${faltando.join(", ")}\n` : "") +
      (sobrando.length ? `  sobrando aqui: ${sobrando.join(", ")}\n` : "") +
      "Acerte a lista (ou o catálogo) antes de mover dado de produção.",
  );
}

function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode a partir da raiz do projeto, com o .env carregado.",
    );
  }
  const aplicar = process.argv.includes("--aplicar");

  // Antes de abrir conexão: se a lista está errada, nem vale conectar.
  conferirContraCatalogo();

  console.log(`Destino: ${descreverDestino(url)}`);
  console.log(`Modo:    ${aplicar ? "APLICAR (escreve no banco)" : "dry-run (não escreve nada)"}\n`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const { validarParent, validarArvore } = await import("../src/lib/empresas/hierarquia");

  let empresas = await prisma.empresa.findMany({ select: { id: true, parentId: true } });
  const porId = new Map(empresas.map((e) => [e.id, e]));

  if (!porId.has(RAIZ)) {
    throw new Error(
      `A raiz "${RAIZ}" não existe. Rode antes: npx tsx scripts/seed-empresas.ts`,
    );
  }

  let movidas = 0;
  let jaOk = 0;
  let puladas = 0;

  for (const id of FILHAS) {
    const atual = porId.get(id);
    if (!atual) {
      console.log(`  pulada   ${id.padEnd(16)} não existe no banco (rode o seed antes)`);
      puladas++;
      continue;
    }
    if (atual.parentId === RAIZ) {
      console.log(`  ok       ${id.padEnd(16)} já pendurada em "${RAIZ}"`);
      jaOk++;
      continue;
    }
    if (atual.parentId !== null) {
      console.log(
        `  pulada   ${id.padEnd(16)} já tem pai "${atual.parentId}" — este script não remaneja, só pendura raiz solta`,
      );
      puladas++;
      continue;
    }

    const veredito = validarParent(id, RAIZ, empresas);
    if (!veredito.ok) {
      console.log(`  RECUSADA ${id.padEnd(16)} ${veredito.motivo}: ${veredito.mensagem}`);
      puladas++;
      continue;
    }

    if (aplicar) {
      await prisma.empresa.update({ where: { id }, data: { parentId: RAIZ } });
      // Estado corrente muda a cada UPDATE: a validação da próxima tem de ver
      // o mundo já com esta aplicada.
      empresas = empresas.map((e) => (e.id === id ? { ...e, parentId: RAIZ } : e));
      console.log(`  MOVIDA   ${id.padEnd(16)} parentId=null → "${RAIZ}"`);
    } else {
      empresas = empresas.map((e) => (e.id === id ? { ...e, parentId: RAIZ } : e));
      console.log(`  moveria  ${id.padEnd(16)} parentId=null → "${RAIZ}"`);
    }
    movidas++;
  }

  console.log(
    `\n${aplicar ? "Movidas" : "Moveria"}: ${movidas}   Já corretas: ${jaOk}   Puladas: ${puladas}`,
  );

  // Auditoria do resultado (real, se aplicou; simulado, se dry-run).
  const problemas = validarArvore(empresas);
  if (problemas.length > 0) {
    console.log("\nÁRVORE FORA DA RÉGUA:");
    for (const p of problemas) console.log(`  ${p.id}: ${p.mensagem}`);
    throw new Error(`${problemas.length} empresa(s) fora da régua de hierarquia.`);
  }
  console.log("Árvore válida: nenhuma empresa fora da régua de 2 níveis.");

  if (!aplicar && movidas > 0) {
    console.log("\nNada foi escrito. Para aplicar: npx tsx scripts/reparent-empresas.ts --aplicar");
  }
}

main()
  .catch((e) => {
    console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clienteAberto?.$disconnect().catch(() => {});
  });
