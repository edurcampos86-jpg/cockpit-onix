/**
 * Backfill: normaliza ClienteBackoffice.telefone existentes para E.164.
 *
 * Uso (com DATABASE_URL setado):
 *   tsx scripts/normalize-phones.ts            # dry-run, só relata
 *   tsx scripts/normalize-phones.ts --apply    # aplica updates
 *
 * Idempotente: pode rodar quantas vezes quiser.
 *
 * Sem o flag --apply, NÃO escreve nada no banco — só imprime quantos
 * registros seriam alterados e amostra de antes/depois.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { toE164 } from "../src/lib/phone";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[normalize-phones] modo: ${apply ? "APPLY" : "DRY-RUN"}`);

  const clientes = await prisma.clienteBackoffice.findMany({
    where: { telefone: { not: null } },
    select: { id: true, nome: true, telefone: true },
  });

  let mudariam = 0;
  let jaOk = 0;
  let invalidos = 0;
  const amostra: Array<{ nome: string; antes: string; depois: string | null }> = [];

  for (const c of clientes) {
    const antes = c.telefone!;
    const depois = toE164(antes);
    if (depois === antes) {
      jaOk++;
      continue;
    }
    if (!depois) {
      invalidos++;
      if (amostra.length < 5) amostra.push({ nome: c.nome, antes, depois: null });
      continue;
    }
    mudariam++;
    if (amostra.length < 10) amostra.push({ nome: c.nome, antes, depois });

    if (apply) {
      await prisma.clienteBackoffice.update({
        where: { id: c.id },
        data: { telefone: depois },
      });
    }
  }

  console.log(`Total clientes com telefone: ${clientes.length}`);
  console.log(`  - já em E.164:           ${jaOk}`);
  console.log(`  - serão normalizados:    ${mudariam} ${apply ? "(APLICADO)" : "(dry-run)"}`);
  console.log(`  - inválidos (mantidos):  ${invalidos}`);
  console.log(`Amostra:`);
  console.table(amostra);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
