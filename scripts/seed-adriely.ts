/**
 * Cadastra Adriely Vidal dos Santos (Onix Capital — Qualidade):
 *  1) Pessoa
 *  2) Numerologia (data nasc 06/12/1994 do termo de estágio)
 *  3) Acordo comercial (Termo de Estágio 05/09/2023)
 *
 * O PAT é processado em script separado.
 *
 * Uso: npx tsx scripts/seed-adriely.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcularNumerologia } from "../src/lib/numerologia";
import * as fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const CPF = "86075437509";
const CONTRATO_PDF =
  "C:\\Users\\edurc\\ONIX CAPITAL AGENTE AUTONOMO DE INVESTIMENTO LTDA\\Rede Interna Onix - Documentos\\5.Jurídico\\ONIX\\EQUIPE\\AAI\\Adriely Vidal dos Santos\\2023_09 - Termo de estágio Adriely - Ass.pdf";

async function main() {
  console.log("🌱 Adriely Vidal dos Santos — pessoa + numerologia + acordo\n");

  const filialSalvador = await prisma.filial.findUnique({ where: { nome: "Salvador" } });
  const deptoQualidade = await prisma.departamento.findUnique({
    where: { nome: "Qualidade" },
  });
  if (!filialSalvador || !deptoQualidade) {
    throw new Error("Filial/Departamento não encontrados");
  }

  const dataNasc = new Date("1994-12-06");

  // 1) Pessoa
  const pessoaData = {
    nomeCompleto: "Adriely Vidal dos Santos",
    apelido: "Adriely",
    email: "qualidade@onixcapital.com.br",
    telefone: null,
    dataNascimento: dataNasc,
    cidade: "Salvador",
    dataEntrada: new Date("2022-12-01"), // contrato PJ inicial dez/2022
    cargoFamilia: "qualidade",
    cargoTitulo: "Estagiária — Qualidade (Administração / UNOPAR)",
    teamRole: "colaborador",
    filialId: filialSalvador.id,
    departamentoId: deptoQualidade.id,
    observacoes:
      "Histórico: Dez/2022 — Contrato PJ de Prestação de Serviços. Set/2023 — Distrato do PJ + novo Termo de Estágio (estagiária em Administração/UNOPAR). Jornada: 30h/sem (10h-16h). RG: 1495143287 SSP/BA. Endereço: Rua Professor Luís Anselmo 15, São Gonçalo, Salvador/BA, CEP 41190-135. Email institucional 'qualidade@onixcapital.com.br' (setorial). Termo de estágio com vigência inicial até 05/09/2024 — pode ter sido prorrogado.",
  };

  const existing = await prisma.pessoa.findUnique({
    where: { cpf: CPF },
    select: { id: true },
  });

  let pessoaId: string;
  if (existing) {
    await prisma.pessoa.update({ where: { id: existing.id }, data: pessoaData });
    pessoaId = existing.id;
    console.log("👤 Adriely (atualizada)");
  } else {
    const created = await prisma.pessoa.create({
      data: { ...pessoaData, cpf: CPF, status: "ativo" },
    });
    pessoaId = created.id;
    console.log("👤 Adriely (nova)");
  }

  // 2) Numerologia
  const n = calcularNumerologia(pessoaData.nomeCompleto, dataNasc);
  await prisma.numerologia.upsert({
    where: { pessoaId },
    update: {
      nomeFonte: pessoaData.nomeCompleto,
      dataNascFonte: dataNasc,
      caminhoVida: n.caminhoVida,
      expressao: n.expressao,
      alma: n.alma,
      personalidade: n.personalidade,
      anoPessoal: n.anoPessoal,
      anoPessoalRef: n.anoPessoalRef,
      karmicos: n.karmicos,
      masterNumbers: n.masterNumbers,
      calculatedAt: new Date(),
    },
    create: {
      pessoaId,
      nomeFonte: pessoaData.nomeCompleto,
      dataNascFonte: dataNasc,
      caminhoVida: n.caminhoVida,
      expressao: n.expressao,
      alma: n.alma,
      personalidade: n.personalidade,
      anoPessoal: n.anoPessoal,
      anoPessoalRef: n.anoPessoalRef,
      karmicos: n.karmicos,
      masterNumbers: n.masterNumbers,
    },
  });
  const masterTag = n.masterNumbers.length > 0 ? ` ⭐(${n.masterNumbers.join(",")})` : "";
  const karmicoTag = n.karmicos.length > 0 ? ` ⚠(${n.karmicos.join(",")})` : "";
  console.log(
    `🔮 Numerologia: CV=${n.caminhoVida} Exp=${n.expressao} Alma=${n.alma} Pers=${n.personalidade} AP=${n.anoPessoal}${masterTag}${karmicoTag}`,
  );

  // 3) Acordo
  const acordoExistente = await prisma.acordoComercial.findFirst({
    where: { pessoaId, dataFim: null },
  });
  if (acordoExistente) {
    console.log("💼 Já tem acordo vigente — pulando");
  } else {
    let pdfBase64: string | null = null;
    let pdfBytes: number | null = null;
    try {
      const buf = fs.readFileSync(CONTRATO_PDF);
      pdfBase64 = buf.toString("base64");
      pdfBytes = buf.length;
    } catch (e) {
      console.log(
        `⚠ Não conseguiu ler PDF do contrato: ${(e as Error).message.slice(0, 80)}`,
      );
    }

    await prisma.acordoComercial.create({
      data: {
        pessoaId,
        tipo: "misto",
        dataInicio: new Date("2023-09-05"),
        regrasEspeciais: `Bolsa de Estágio mensal:
• R$ 2.500,00 (fixo)
• + 2% receita líquida do setor de plano de saúde
• + 20% receita líquida por indicações em todos os setores (exceto plano de saúde e BTG Investimentos)
• + 1% receita líquida do setor de Planejamento Patrimonial
• + 1% receita líquida das comissões geradas da base de Eduardo Rodrigues

Jornada: 30 horas semanais (6h diárias) — das 10h00 às 16h00.

Lei 11.788/2008. Termo de Compromisso de Estágio com supervisão de Eduardo Rodrigues Campos.

Histórico:
• Dez/2022: Contrato Prestação de Serviços PJ
• Jan/2023: Aditivo
• Set/2023: Distrato do PJ + Termo de Estágio (modalidade atual)`,
        observacoes:
          "Termo de Estágio assinado em 12/09/2023 via Clicksign. Início 05/09/2023, término inicial 05/09/2024 — provavelmente prorrogado (Eduardo confirmou que continua no time). IES: UNOPAR (CNPJ 17.234.583/0001-14), curso Administração noturno.",
        contratoFilename: "2023_09 - Termo de estágio Adriely - Ass.pdf",
        contratoMimeType: pdfBase64 ? "application/pdf" : null,
        contratoBase64: pdfBase64,
        contratoBytes: pdfBytes,
      },
    });
    const tag = pdfBase64 ? `📎 ${Math.round((pdfBytes ?? 0) / 1024)}KB` : "(sem PDF)";
    console.log(`💼 Acordo: misto (estágio R$2.500 + comissões) | ${tag}`);
  }

  console.log("\n✅ Adriely cadastrada. Falta processar o PAT dela (script separado).");
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
