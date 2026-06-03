/**
 * Teste em SCRATCH do merge transacional de clientes leading-zero.
 *
 * NÃO roda contra produção: espera DATABASE_URL apontando para um Postgres
 * efêmero (ver scripts/run-merge-scratch-test.sh). Semeia dois fixtures,
 * roda executarMergeLeadingZeros e checa os gates.
 *
 *   Fixture A (par limpo): antigo "2870286" + novo "002870286". Antigo com
 *     MovimentacaoBtg/ReuniaoCliente/Conversa/PerfilDescoberta; novo sem
 *     PerfilDescoberta. Espera: novo herda tudo, antigo deletado, counts
 *     conservados, zero órfãos, Conversa não vira null.
 *   Fixture B (conflito 1:1): antigo "3980412" + novo "003980412", AMBOS com
 *     PerfilDescoberta. Espera: merge abortado, os dois clientes intactos.
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { executarMergeLeadingZeros } from "@/lib/backoffice/merge-leading-zeros";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

let falhas = 0;
function check(nome: string, cond: boolean, extra = "") {
  const ok = cond === true;
  if (!ok) falhas++;
  console.log(`${ok ? "PASS" : "FALHA"} — ${nome}${extra ? `  (${extra})` : ""}`);
}

async function criarCliente(nome: string, numeroConta: string): Promise<string> {
  const c = await prisma.clienteBackoffice.create({ data: { nome, numeroConta } });
  return c.id;
}

async function seedFilhosAntigo(clienteId: string, numeroConta: string, tag: string) {
  await prisma.movimentacaoBtg.createMany({
    data: [0, 1, 2].map((i) => ({
      clienteId,
      numeroConta,
      data: new Date(2026, 0, 1 + i),
      tipo: "APLICACAO",
      valor: 1000 + i,
      hashUnico: `hash-${tag}-${i}`,
    })),
  });
  await prisma.reuniaoCliente.createMany({
    data: [0, 1].map((i) => ({
      clienteId,
      source: "manual",
      externalId: `ext-${tag}-${i}`,
      startAt: new Date(2026, 1, 1 + i),
      matchedVia: "manual",
    })),
  });
  await prisma.conversa.createMany({
    data: [0, 1].map((i) => ({
      clienteId,
      externalId: `conv-${tag}-${i}`,
      instanceId: "inst-test",
    })),
  });
}

async function main() {
  // Limpa fixtures de execuções anteriores (idempotente).
  await prisma.clienteBackoffice.deleteMany({
    where: { numeroConta: { in: ["2870286", "002870286", "3980412", "003980412"] } },
  });

  // ── Fixture A
  const aAntigo = await criarCliente("Fixture A", "2870286");
  const aNovo = await criarCliente("Fixture A", "002870286");
  await seedFilhosAntigo(aAntigo, "2870286", "A");
  await prisma.perfilDescoberta.create({ data: { clienteId: aAntigo, sonhos: "perfil do antigo" } });

  // ── Fixture B (conflito 1:1)
  const bAntigo = await criarCliente("Fixture B", "3980412");
  const bNovo = await criarCliente("Fixture B", "003980412");
  await seedFilhosAntigo(bAntigo, "3980412", "B");
  await prisma.perfilDescoberta.create({ data: { clienteId: bAntigo, sonhos: "perfil B antigo" } });
  await prisma.perfilDescoberta.create({ data: { clienteId: bNovo, sonhos: "perfil B novo (curado)" } });

  const movsAntes = await prisma.movimentacaoBtg.count();

  // ── Executa
  const summary = await executarMergeLeadingZeros(prisma);
  console.log("\n=== summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n=== gates ===");

  // ── Gates Fixture A (merge bem-sucedido)
  const aAntigoExiste = await prisma.clienteBackoffice.findUnique({ where: { id: aAntigo } });
  const aNovoExiste = await prisma.clienteBackoffice.findUnique({ where: { id: aNovo } });
  check("A: antigo deletado", aAntigoExiste === null);
  check("A: novo existe", aNovoExiste !== null);

  const aMovNovo = await prisma.movimentacaoBtg.count({ where: { clienteId: aNovo } });
  const aMovAntigo = await prisma.movimentacaoBtg.count({ where: { clienteId: aAntigo } });
  check("A: 3 movimentações herdadas pelo novo", aMovNovo === 3, `novo=${aMovNovo}`);
  check("A: zero movimentações órfãs no antigo", aMovAntigo === 0, `antigo=${aMovAntigo}`);

  const aReuniaoNovo = await prisma.reuniaoCliente.count({ where: { clienteId: aNovo } });
  check("A: 2 reuniões herdadas pelo novo", aReuniaoNovo === 2, `novo=${aReuniaoNovo}`);

  const aConvNovo = await prisma.conversa.count({ where: { clienteId: aNovo } });
  const aConvNull = await prisma.conversa.count({ where: { clienteId: null, externalId: { startsWith: "conv-A-" } } });
  check("A: 2 conversas herdadas pelo novo", aConvNovo === 2, `novo=${aConvNovo}`);
  check("A: nenhuma conversa virou null (SetNull não disparou)", aConvNull === 0, `null=${aConvNull}`);

  const aPerfilNovo = await prisma.perfilDescoberta.count({ where: { clienteId: aNovo } });
  check("A: PerfilDescoberta 1:1 religado ao novo", aPerfilNovo === 1, `novo=${aPerfilNovo}`);

  const movsConservadas = await prisma.movimentacaoBtg.count();
  check("A: total de movimentações conservado", movsConservadas === movsAntes, `antes=${movsAntes} depois=${movsConservadas}`);

  // ── Gates Fixture B (conflito 1:1 → abortado, tudo intacto)
  const bAntigoExiste = await prisma.clienteBackoffice.findUnique({ where: { id: bAntigo } });
  const bNovoExiste = await prisma.clienteBackoffice.findUnique({ where: { id: bNovo } });
  check("B: antigo intacto (não deletado)", bAntigoExiste !== null);
  check("B: novo intacto", bNovoExiste !== null);

  const bResultado = summary.resultados.find((r) => r.antigoId === bAntigo);
  check("B: par marcado como abortado-conflito-1a1", bResultado?.status === "abortado-conflito-1a1", `status=${bResultado?.status}`);

  const bMovAntigo = await prisma.movimentacaoBtg.count({ where: { clienteId: bAntigo } });
  const bPerfilAntigo = await prisma.perfilDescoberta.count({ where: { clienteId: bAntigo } });
  const bPerfilNovo = await prisma.perfilDescoberta.count({ where: { clienteId: bNovo } });
  check("B: filhos do antigo intactos (3 movs)", bMovAntigo === 3, `antigo=${bMovAntigo}`);
  check("B: PerfilDescoberta do antigo intacto", bPerfilAntigo === 1, `antigo=${bPerfilAntigo}`);
  check("B: PerfilDescoberta do novo intacto (não sobrescrito)", bPerfilNovo === 1, `novo=${bPerfilNovo}`);

  // ── Limpeza
  await prisma.clienteBackoffice.deleteMany({
    where: { numeroConta: { in: ["2870286", "002870286", "3980412", "003980412"] } },
  });

  console.log(`\n=== RESULTADO: ${falhas === 0 ? "TODOS OS GATES PASSARAM" : `${falhas} GATE(S) FALHARAM`} ===`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("ERRO no teste:", e);
  await prisma.$disconnect();
  process.exit(2);
});
