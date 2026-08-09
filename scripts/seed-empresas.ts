/**
 * Seed da tabela `Empresa` — IDEMPOTENTE.
 *
 * Cria a raiz "Onix Co" e as 5 empresas jurídicas do grupo — estas já com
 * `parentId = "onix-co"`. Total: 6 linhas.
 *
 * ── ONDE MORA A LÓGICA ───────────────────────────────────────────────────
 * Não aqui. A lista canônica e a mecânica de idempotência vivem em
 * `src/lib/empresas/seed-hierarquia.ts`, compartilhado com
 * `POST /api/empresas/hierarquia`. A diferença entre os dois consumidores é só
 * QUAIS empresas cada um passa: este script semeia as 6 de uma vez; o endpoint
 * separa em duas ações (a raiz por padrão, as filhas em `acao: "seed-filhas"`).
 *
 * ── O QUE ESTE SEED NÃO FAZ ──────────────────────────────────────────────
 * NÃO faz reparenting. Ele decide o pai de linha que NASCE; o pai de linha que
 * JÁ EXISTE nunca é tocado aqui, nem quando está errado — para isso existe
 * `scripts/reparent-empresas.ts`, com dry-run e conferência antes do UPDATE.
 *
 * A única escrita é um create condicional; não há UPDATE nem DELETE.
 *
 * Como rodar:
 *   npx tsx scripts/seed-empresas.ts
 */

/*
 * Só `dotenv/config` e o módulo de semeadura são imports estáticos. O cliente
 * entra por import DINÂMICO dentro de main(), depois do guard de DATABASE_URL:
 * `src/lib/prisma.ts:10` constrói o PrismaClient no momento do import usando
 * `process.env.DATABASE_URL!`, então um import estático faria a falta da
 * variável estourar como erro do driver antes da nossa mensagem.
 *
 * O módulo de semeadura é seguro como import estático justamente porque NÃO
 * importa `@/lib/prisma` — ele recebe o client por parâmetro.
 *
 * Reusa o singleton da aplicação em vez de montar um cliente próprio: no
 * Prisma 7 o `new PrismaClient()` sem opções LANÇA (é preciso passar o adapter
 * PrismaPg), e duplicar essa fiação aqui seria um segundo lugar para manter.
 */
import "dotenv/config";
import {
  ONIX_CO,
  TODAS_AS_EMPRESAS,
  conferirRaiz,
  semearEmpresas,
} from "../src/lib/empresas/seed-hierarquia";

/** Só o contrato de desconexão, para o `finally` não exigir import estático do tipo. */
let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/** Host de destino sem credencial — a URL do Postgres carrega usuário e senha. */
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
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const r = await semearEmpresas(prisma, TODAS_AS_EMPRESAS);

  console.log(`\nEmpresas antes:    ${r.totalAntes}`);
  console.log(`Inseridas agora:   ${r.inseridas}`);
  console.log(`Empresas depois:   ${r.totalDepois}`);

  if (r.resultado === "ja_existia") {
    console.log(
      `\nNada a fazer — as ${TODAS_AS_EMPRESAS.length} já existiam. (Rodar de novo é seguro.)`,
    );
  }

  // Conferência: a raiz precisa existir e precisa ser raiz. Se alguém já
  // pendurou a "onix-co" em outra empresa, isso aqui grita — este seed não
  // corrige vínculo, e corrigir em silêncio esconderia como aconteceu.
  const raiz = conferirRaiz(r.arvore);
  if (!raiz.existe) {
    throw new Error(
      `A raiz "${ONIX_CO.id}" não existe após o seed — investigue antes de seguir.`,
    );
  }
  if (!raiz.ehRaiz) {
    console.log(
      `\nATENÇÃO: a raiz "${ONIX_CO.id}" está com parentId="${raiz.parentIdInesperado}". ` +
        "Ela deveria ser raiz. Este seed não corrige vínculo — verifique à mão.",
    );
  } else {
    console.log(`\nRaiz confirmada: "${ONIX_CO.nome}" (id=${ONIX_CO.id}, parentId=null).`);
  }

  console.log(
    `Empresas com pai:  ${r.comPai}   ` +
      "(esperado 0 nesta fase — o reparenting é PR seguinte.)",
  );
}

main()
  .catch((e) => {
    console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // null quando a falha foi antes do import dinâmico (ex.: DATABASE_URL ausente).
    await clienteAberto?.$disconnect().catch(() => {});
  });
