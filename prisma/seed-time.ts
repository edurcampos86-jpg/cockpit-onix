/**
 * Seed para o módulo Time — idempotente.
 *
 * Cria/atualiza filiais e departamentos. NÃO deleta nada e NÃO mexe em pessoas
 * existentes. Pode ser rodado a qualquer momento.
 *
 * Uso standalone:  npm run db:seed:time
 * Também é chamado por seed.ts ao final do bootstrap geral.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const FILIAIS = [
  { nome: "Salvador", cidade: "Salvador", estado: "BA", isMatriz: true },
  { nome: "Barreiras", cidade: "Barreiras", estado: "BA", isMatriz: false },
  { nome: "Unaí", cidade: "Unaí", estado: "MG", isMatriz: false },
] as const;

const DEPARTAMENTOS = [
  "Investimentos",
  "Imobiliária",
  "Corretora",
  "Qualidade",
  "Administrativo",
] as const;

export async function seedTime(prisma: PrismaClient): Promise<void> {
  console.log("🌱 Seed Time — filiais e departamentos");

  for (const f of FILIAIS) {
    await prisma.filial.upsert({
      where: { nome: f.nome },
      update: { cidade: f.cidade, estado: f.estado, isMatriz: f.isMatriz },
      create: { nome: f.nome, cidade: f.cidade, estado: f.estado, isMatriz: f.isMatriz },
    });
    console.log(`  ✓ Filial: ${f.nome}${f.isMatriz ? " (matriz)" : ""}`);
  }

  for (const nome of DEPARTAMENTOS) {
    await prisma.departamento.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    console.log(`  ✓ Departamento: ${nome}`);
  }

  console.log("✅ Seed Time concluído");
}

// Permite executar este arquivo standalone via tsx prisma/seed-time.ts
if (require.main === module) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  seedTime(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
