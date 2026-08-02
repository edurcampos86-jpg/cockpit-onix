/**
 * Preenche Pessoa.codigoAssessorBtg a partir do que a Base BTG já revela.
 *
 * Os 16 pares (nome, código) abaixo saíram do próprio relatório Base BTG —
 * colunas "Assessor" e "Código do Assessor", 2.643 linhas, 1 código por
 * assessor, sem exceção. Digitar isso a mão na tela, 16 vezes, é onde o erro
 * entra.
 *
 * DRY-RUN por padrão. Para gravar:
 *   npx tsx scripts/seed-codigo-assessor-btg.ts --apply
 *
 * Casamento por nome, não por e-mail: dos 16 assessores, só 4 têm e-mail
 * idêntico ao cadastrado no /time (o do Eduardo é eduardo.campos@ no BTG e
 * eduardo.rodrigues@ aqui). O critério é ≥2 tokens de nome em comum, e
 * qualquer ambiguidade (0 ou 2+ pessoas casando) é REPORTADA, nunca resolvida
 * no chute — mesma postura do índice de matching de auto-encerrar-core.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

/** (nome como vem na Base BTG, código do assessor) */
const ASSESSORES: Array<[string, string]> = [
  ["VINICIUS DE ASSIS", "949754"],
  ["MAXSUEL DE JESUS", "2556363"],
  ["GUSTAVO NASCIMENTO", "526842"],
  ["DANIEL SARAIVA SANTOS FILHO", "64141"],
  ["EDUARDO RODRIGUES CAMPOS", "2108333"],
  ["GUSTAVO DINIZ", "1196533"],
  ["HUMBERTO LUIZ ANDRADE BARROS NETO", "2342967"],
  ["ANA VASCONCELOS", "8469449"],
  ["RAFAELA GONCALVES", "6134198"],
  ["VICTOR MARQUES", "2818670"],
  ["MARCELO PENNA", "56890203"],
  ["DIEGO DE OLIVEIRA E ALMEIDA", "2108356"],
  ["ALAN SILVA LIMA", "8468268"],
  ["PEDRO HENRIQUE", "1655714"],
  ["FELIPE SOARES TACHARD PUGAS", "57418439"],
  ["LAIANE GALEAO SANTOS", "20972369"],
];

function tokens(nome: string): Set<string> {
  return new Set(
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2), // "de", "e", "da" não identificam ninguém
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const pessoas = await prisma.pessoa.findMany({
    select: { id: true, nomeCompleto: true, codigoAssessorBtg: true },
  });

  console.log(`${pessoas.length} pessoas no /time · ${ASSESSORES.length} assessores na Base BTG`);
  console.log(apply ? "MODO: gravando\n" : "MODO: dry-run (use --apply para gravar)\n");

  let ok = 0;
  const problemas: string[] = [];

  for (const [nomeBtg, codigo] of ASSESSORES) {
    const tb = tokens(nomeBtg);
    const candidatos = pessoas.filter((p) => {
      const tp = tokens(p.nomeCompleto);
      return [...tb].filter((t) => tp.has(t)).length >= 2;
    });

    if (candidatos.length === 0) {
      problemas.push(`SEM PESSOA   ${nomeBtg} (cod ${codigo}) — não existe no /time`);
      continue;
    }
    if (candidatos.length > 1) {
      const nomes = candidatos.map((c) => c.nomeCompleto).join(" | ");
      problemas.push(`AMBIGUO      ${nomeBtg} (cod ${codigo}) → ${nomes}`);
      continue;
    }

    const p = candidatos[0];
    if (p.codigoAssessorBtg === codigo) {
      console.log(`  = ${p.nomeCompleto} já está com ${codigo}`);
      ok++;
      continue;
    }
    if (p.codigoAssessorBtg && p.codigoAssessorBtg !== codigo) {
      problemas.push(
        `DIVERGENTE   ${p.nomeCompleto} tem ${p.codigoAssessorBtg}, Base BTG diz ${codigo}`,
      );
      continue;
    }

    if (apply) {
      await prisma.pessoa.update({
        where: { id: p.id },
        data: {
          codigoAssessorBtg: codigo,
          // Autoria: "seed" distingue o que veio deste script do que alguém
          // digitou na tela. Quando um código estiver errado, a primeira
          // pergunta ("veio da Base BTG ou foi digitado?") tem resposta.
          codigoAssessorBtgEditadoEm: new Date(),
          codigoAssessorBtgEditadoPor: "seed",
        },
      });
    }
    console.log(`  ${apply ? "✓" : "→"} ${p.nomeCompleto} = ${codigo}`);
    ok++;
  }

  console.log(`\n${ok}/${ASSESSORES.length} resolvidos`);
  if (problemas.length) {
    console.log(`\n${problemas.length} para olhar à mão:`);
    for (const p of problemas) console.log(`  ${p}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
