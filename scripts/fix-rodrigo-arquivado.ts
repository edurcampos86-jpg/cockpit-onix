/**
 * Eduardo informou que o Rodrigo NÃO ESTÁ MAIS no time. Cadastrei equivocadamente
 * como ativo — vou arquivá-lo (mas mantém histórico de PAT + acordo, que pode
 * ser útil pra reportagem futura).
 *
 * Marcus Figueredo não deve estar cadastrado (era testemunha em 2023, saiu mar/2024).
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Arquivar Rodrigo (CPF 60752629549)
  const rodrigo = await prisma.pessoa.findUnique({
    where: { cpf: "60752629549" },
    select: { id: true, nomeCompleto: true, status: true },
  });

  if (rodrigo) {
    await prisma.pessoa.update({
      where: { id: rodrigo.id },
      data: {
        status: "arquivado",
        dataSaida: new Date(), // Eduardo informa data exata depois
        motivoSaida: "saida_voluntaria", // ou "outro" — Eduardo edita
        observacoes:
          (await prisma.pessoa.findUnique({
            where: { id: rodrigo.id },
            select: { observacoes: true },
          }))?.observacoes +
          "\n\n⚠ Arquivado em " +
          new Date().toLocaleDateString("pt-BR") +
          " — não está mais no time. Histórico (PAT, acordo) preservado.",
      },
    });
    console.log(`✓ Rodrigo arquivado (status: ${rodrigo.status} → arquivado)`);
  } else {
    console.log("Rodrigo não estava cadastrado — nada a fazer");
  }

  // Verifica Marcus
  const marcus = await prisma.pessoa.findUnique({
    where: { cpf: "00250417545" }, // CPF 002.504.175-45
    select: { id: true },
  });
  if (marcus) {
    console.log(`Marcus está cadastrado — arquivando também`);
    await prisma.pessoa.update({
      where: { id: marcus.id },
      data: { status: "arquivado", dataSaida: new Date(), motivoSaida: "saida_voluntaria" },
    });
  } else {
    console.log("Marcus não cadastrado — OK, não preciso fazer nada");
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
