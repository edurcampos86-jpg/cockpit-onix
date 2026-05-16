/**
 * Salva DATACRAZY_WEBHOOK_SECRET na tabela Config (lida via getConfig pelo
 * handler em /api/webhooks/datacrazy).
 *
 * Uso (com DATABASE_URL setado — local com .env ou via `railway run`):
 *   DATACRAZY_WEBHOOK_SECRET="<secret>" tsx scripts/save-datacrazy-webhook-secret.ts
 *
 * Ou com Railway CLI:
 *   DATACRAZY_WEBHOOK_SECRET="<secret>" railway run tsx scripts/save-datacrazy-webhook-secret.ts
 *
 * Idempotente: rodar várias vezes só substitui o valor.
 *
 * Substitui o `scripts/save-datacrazy-token.js` antigo, que parou de
 * funcionar quando o generator Prisma virou `prisma-client` (TS-only) —
 * `require("../src/generated/prisma")` não resolve mais.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const secret = process.env.DATACRAZY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("DATACRAZY_WEBHOOK_SECRET não definido. Passe via env:");
    console.error(
      '  DATACRAZY_WEBHOOK_SECRET="..." tsx scripts/save-datacrazy-webhook-secret.ts',
    );
    process.exit(1);
  }

  const result = await prisma.config.upsert({
    where: { key: "DATACRAZY_WEBHOOK_SECRET" },
    create: { key: "DATACRAZY_WEBHOOK_SECRET", value: secret },
    update: { value: secret },
  });

  console.log(`DATACRAZY_WEBHOOK_SECRET salvo (${result.value.length} chars)`);
  console.log(`updatedAt: ${result.updatedAt.toISOString()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
