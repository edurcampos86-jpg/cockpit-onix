/**
 * Cadastra as chaves de notificação (Slack + WhatsApp) na tabela Config.
 *
 * Uso (DATABASE_URL apontando pra prod):
 *   SLACK_ALERTS_WEBHOOK_URL="https://hooks.slack.com/services/..." \
 *   DATACRAZY_ALERTS_PHONE="5571999999999" \
 *   DATACRAZY_ALERTS_INSTANCE="3E8B5A39..." \
 *   tsx scripts/save-notification-config.ts
 *
 * Opcional:
 *   DATACRAZY_CLIENT_TOKEN="..." pra Z-API com token de segurança ligado.
 *
 * Idempotente: só substitui os valores existentes — nunca cria/dropa outros
 * registros. Falha cedo se alguma var obrigatória estiver vazia, pra evitar
 * gravar string vazia que silencia notify() em produção.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const REQUIRED = [
  "SLACK_ALERTS_WEBHOOK_URL",
  "DATACRAZY_ALERTS_PHONE",
  "DATACRAZY_ALERTS_INSTANCE",
] as const;

const OPTIONAL = ["DATACRAZY_CLIENT_TOKEN"] as const;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não setada.");
    process.exit(2);
  }

  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error("Variáveis obrigatórias ausentes:");
    for (const k of missing) console.error(`  - ${k}`);
    process.exit(2);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const toWrite: Array<{ key: string; value: string }> = [];
    for (const k of REQUIRED) toWrite.push({ key: k, value: process.env[k]! });
    for (const k of OPTIONAL) if (process.env[k]) toWrite.push({ key: k, value: process.env[k]! });

    for (const { key, value } of toWrite) {
      await prisma.config.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
      // Mascara o valor pra não imprimir secret no log do Railway.
      const masked = value.length > 8 ? value.slice(0, 4) + "..." + value.slice(-4) : "***";
      console.log(`  ✓ ${key} = ${masked}`);
    }
    console.log(`\nCadastrado ${toWrite.length} chaves em Config.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
