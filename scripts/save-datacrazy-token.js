#!/usr/bin/env node
/**
 * Salva DATACRAZY_TOKEN no banco de dados (Config table).
 *
 * Uso:
 *   DATACRAZY_TOKEN="dc_eyJ..." node scripts/save-datacrazy-token.js
 *
 * Ou com DATABASE_URL explícito:
 *   DATABASE_URL="postgresql://..." DATACRAZY_TOKEN="dc_eyJ..." node scripts/save-datacrazy-token.js
 */

const token = process.env.DATACRAZY_TOKEN;
if (!token) {
  console.error("❌  DATACRAZY_TOKEN nao definido. Passe via env:");
  console.error('   DATACRAZY_TOKEN="dc_eyJ..." node scripts/save-datacrazy-token.js');
  process.exit(1);
}

const { PrismaClient } = require("../src/generated/prisma");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.config.upsert({
    where: { key: "DATACRAZY_TOKEN" },
    create: { key: "DATACRAZY_TOKEN", value: token },
    update: { value: token },
  });
  console.log(`✅  DATACRAZY_TOKEN salvo no banco (${result.value.length} chars)`);
  console.log(`    updatedAt: ${result.updatedAt}`);
}

main()
  .catch((e) => {
    console.error("❌  Erro ao salvar:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
