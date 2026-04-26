import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const count = await prisma.pat.count();
  console.log(`Total Pats no banco: ${count}\n`);
  const pats = await prisma.pat.findMany({
    include: { pessoa: { select: { apelido: true, nomeCompleto: true } } },
    orderBy: { uploadedAt: "asc" },
  });
  for (const p of pats) {
    const nome = p.pessoa.apelido || p.pessoa.nomeCompleto;
    console.log(
      `  ${nome.padEnd(22)} | ${p.status.padEnd(10)} | persp=${p.perspectiva ?? "?"} | amb=${p.ambienteNome ?? "?"}`,
    );
  }
}
main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
