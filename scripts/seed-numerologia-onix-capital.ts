/**
 * Calcula e salva numerologia para os 12 sócios da Onix Capital AI.
 *
 * Como já tenho nome + data de nascimento (extraídos do contrato social ao olhar
 * o PDF), chamo direto a função pura `calcularNumerologia` em vez de passar pelo
 * Claude — economiza Eduardo o trabalho de subir o PDF 12 vezes na UI.
 *
 * Idempotente: usa upsert por pessoaId.
 *
 * Uso: npx tsx scripts/seed-numerologia-onix-capital.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcularNumerologia } from "../src/lib/numerologia";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Numerologia — Onix Capital AI\n");

  const pessoas = await prisma.pessoa.findMany({
    where: { status: "ativo", dataNascimento: { not: null } },
    select: { id: true, nomeCompleto: true, apelido: true, dataNascimento: true },
    orderBy: { nomeCompleto: "asc" },
  });

  if (pessoas.length === 0) {
    console.log("Nenhuma pessoa ativa com data de nascimento. Rode seed-pessoas primeiro.");
    return;
  }

  let criadas = 0;
  let atualizadas = 0;

  for (const p of pessoas) {
    if (!p.dataNascimento) continue;

    const n = calcularNumerologia(p.nomeCompleto, new Date(p.dataNascimento));

    const existente = await prisma.numerologia.findUnique({
      where: { pessoaId: p.id },
      select: { id: true },
    });

    const data = {
      nomeFonte: p.nomeCompleto,
      dataNascFonte: p.dataNascimento,
      caminhoVida: n.caminhoVida,
      expressao: n.expressao,
      alma: n.alma,
      personalidade: n.personalidade,
      anoPessoal: n.anoPessoal,
      anoPessoalRef: n.anoPessoalRef,
      karmicos: n.karmicos,
      masterNumbers: n.masterNumbers,
      calculatedAt: new Date(),
    };

    if (existente) {
      await prisma.numerologia.update({ where: { pessoaId: p.id }, data });
      atualizadas++;
    } else {
      await prisma.numerologia.create({ data: { ...data, pessoaId: p.id } });
      criadas++;
    }

    const masterTag = n.masterNumbers.length > 0 ? ` ⭐(${n.masterNumbers.join(",")})` : "";
    const karmicoTag = n.karmicos.length > 0 ? ` ⚠(${n.karmicos.join(",")})` : "";
    console.log(
      `  ${p.apelido?.padEnd(20) ?? p.nomeCompleto.padEnd(20)}` +
        ` CV=${String(n.caminhoVida).padStart(2)}` +
        ` Exp=${String(n.expressao).padStart(2)}` +
        ` Alma=${String(n.alma).padStart(2)}` +
        ` Pers=${String(n.personalidade).padStart(2)}` +
        ` AnoPess=${String(n.anoPessoal).padStart(2)} (${n.anoPessoalRef})` +
        masterTag +
        karmicoTag,
    );
  }

  console.log(`\n📊 Resultado: ${criadas} criadas, ${atualizadas} atualizadas`);
  console.log("\nLegenda: CV=Caminho da Vida | Exp=Expressão | ⭐=Master | ⚠=Kármico");
  console.log("\n✅ Numerologia disponível em /time/[id] para cada pessoa (admin only).");
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
