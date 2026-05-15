/**
 * Backfill: preenche ClienteBackoffice.ultimaReuniaoAt a partir do
 * histórico de InteracaoCliente (tipo = "reuniao").
 *
 * Antes deste fix, o POST de /api/backoffice/clientes/[id]/interacoes
 * gravava a interação como "reuniao" mas não atualizava o campo
 * ultimaReuniaoAt do cliente — só ultimoContatoAt. Resultado: a
 * coluna "Última reunião" na lista de clientes ficava vazia mesmo
 * com reuniões cadastradas no histórico.
 *
 * Este script roda uma vez para regularizar a base.
 *
 * Uso (com DATABASE_URL setado):
 *   tsx scripts/backfill-ultima-reuniao.ts            # dry-run, só relata
 *   tsx scripts/backfill-ultima-reuniao.ts --apply    # aplica updates
 *
 * Idempotente: rodar várias vezes não causa estrago — só atualiza
 * onde a maior data de reunião no histórico for mais nova que o
 * valor atual de ultimaReuniaoAt.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[backfill-ultima-reuniao] modo: ${apply ? "APPLY" : "DRY-RUN"}`);

  // Agrupa InteracaoCliente por clienteId pegando a maior data onde tipo='reuniao'
  const maxPorCliente = await prisma.interacaoCliente.groupBy({
    by: ["clienteId"],
    where: { tipo: "reuniao" },
    _max: { data: true },
  });

  console.log(`Clientes com pelo menos 1 reunião no histórico: ${maxPorCliente.length}`);

  let atualizariam = 0;
  let jaOk = 0;
  const amostra: Array<{ nome: string; antes: string | null; depois: string }> = [];

  for (const row of maxPorCliente) {
    const novaData = row._max.data;
    if (!novaData) continue;

    const cliente = await prisma.clienteBackoffice.findUnique({
      where: { id: row.clienteId },
      select: { id: true, nome: true, ultimaReuniaoAt: true },
    });
    if (!cliente) continue;

    const atual = cliente.ultimaReuniaoAt;
    if (atual && atual >= novaData) {
      jaOk++;
      continue;
    }

    atualizariam++;
    if (amostra.length < 10) {
      amostra.push({
        nome: cliente.nome,
        antes: atual ? atual.toISOString().slice(0, 10) : null,
        depois: novaData.toISOString().slice(0, 10),
      });
    }

    if (apply) {
      await prisma.clienteBackoffice.update({
        where: { id: cliente.id },
        data: { ultimaReuniaoAt: novaData },
      });
    }
  }

  console.log(`  - já em dia:             ${jaOk}`);
  console.log(`  - serão atualizados:     ${atualizariam} ${apply ? "(APLICADO)" : "(dry-run)"}`);
  console.log(`Amostra:`);
  console.table(amostra);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
