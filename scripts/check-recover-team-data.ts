/**
 * Confere a rede de restauração do /time contra o banco.
 *
 *   npx tsx --conditions=react-server scripts/check-recover-team-data.ts
 *
 * O `--conditions=react-server` é obrigatório: `src/lib/recover-team-data.ts`
 * declara `import "server-only"`, e o pacote `server-only` lança de propósito
 * quando resolvido pela condição `default`. A flag faz o resolvedor pegar o
 * ramo que não lança — mesma solução já usada em outros scripts do repo.
 *
 * Sai com código 1 quando há divergência, para poder virar gate de release.
 *
 * POR QUE NÃO É UM TESTE DO `npm test`: o CI não tem DATABASE_URL
 * (.github/workflows/ci.yml não define nenhum secret de banco), então um teste
 * que consultasse o banco falharia em toda PR por falta de conexão, não por
 * divergência real. O que dá para travar no CI é a LÓGICA da comparação — e
 * isso está coberto por src/lib/recover-team-data-diff.test.ts, que roda puro,
 * sem banco. Este script é a metade que precisa de produção e roda sob demanda.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { TIME_VERSIONADO } from "../src/lib/recover-team-data";
import {
  compararTime,
  formatarDivergencia,
  temDivergencia,
} from "../src/lib/recover-team-data-diff";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const doBanco = await prisma.pessoa.findMany({
    select: { cpf: true, nomeCompleto: true, email: true },
  });

  console.log(
    `arquivo: ${TIME_VERSIONADO.length} pessoas · banco: ${doBanco.length} pessoas\n`,
  );

  const divergencia = compararTime(TIME_VERSIONADO, doBanco);
  const linhas = formatarDivergencia(divergencia);

  if (!temDivergencia(divergencia)) {
    console.log("✓ recover-team-data.ts bate com o banco");
    return;
  }

  console.log(`${linhas.length} divergência(s):\n`);
  for (const l of linhas) console.log(`  ${l}`);
  console.log(
    "\nCorrija recover-team-data.ts — é dele que o time volta se o banco se perder.",
  );
  process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
