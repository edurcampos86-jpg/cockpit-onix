/**
 * Cadastra os acordos comerciais das 6 pessoas dos contratos enviados pelo Eduardo.
 *
 * Idempotente: pula se já existe acordo vigente (dataFim null) com mesmo tipo
 * pra mesma pessoa.
 *
 * Uso: npx tsx scripts/seed-acordos-comerciais.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "node:fs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type AcordoSeed = {
  cpf: string;
  apelido: string; // só pra log
  pdfPath: string;
  tipo: "pro_labore" | "split" | "comissao" | "misto";
  regrasEspeciais: string;
  dataInicio: Date;
  observacoes: string;
};

const BASE = "C:\\Users\\edurc\\ONIX CAPITAL AGENTE AUTONOMO DE INVESTIMENTO LTDA\\Rede Interna Onix - Documentos\\5.Jurídico";

const ACORDOS: AcordoSeed[] = [
  {
    cpf: "02464139564",
    apelido: "Thiago",
    pdfPath: `${BASE}\\ONX Corretora\\EQUIPE\\ATIVO\\Thiago Moreira Vergal\\2026_Contrato de intermediação de negócios - Thiago Vergal.docx - Ass.pdf`,
    tipo: "misto",
    regrasEspeciais: `Pagamento mensal:
• R$ 5.000,00 até junho de 2026
• R$ 4.000,00 a partir de julho de 2026

Comissões adicionais:
• 5% sobre comissão líquida da ONX em negócios de operação direta
• 25% sobre comissão líquida em negócios indicados pelo PARCEIRO

PJ contratada: THIAGO MOREIRA VERGAL (CNPJ 63.560.664/0001-25)
Conta de pagamento: BTG Pactual ag. 0020 cc. 1761153-4 PIX 024.641.395-64.
Pagamento até dia 10 do mês subsequente ao recebimento das comissões pela ONX.`,
    dataInicio: new Date("2025-11-01"),
    observacoes:
      "Contrato de intermediação de negócios firmado com Onx Agro Corretora (CNPJ 31.238.019/0001-02). Vigente desde 01/11/2025. Assinaturas concluídas em 06/02/2026 via Clicksign.",
  },
  {
    cpf: "70214999572",
    apelido: "Alexandra",
    pdfPath: `${BASE}\\ONX Corretora\\EQUIPE\\ATIVO\\Alexandra Gonçalves Viana\\2024_01 - Contrato Prestação de Serviços - Alexandra Viana - Ass.pdf`,
    tipo: "comissao",
    regrasEspeciais: `Remuneração: 1% do faturamento bruto da Onx Corretora.
Pagamento até o décimo dia do mês subsequente, mediante apresentação de NF.

PJ contratada: DNS TELECOM LTDA (CNPJ 26.715.377/0001-10)
Sede da PJ: Saubara/BA. Atua na sede de Salvador.`,
    dataInicio: new Date("2024-01-31"),
    observacoes:
      "Contrato de prestação de serviços de administração com Onx Agro Corretora (CNPJ 31.238.019/0001-02). Vigente desde 31/01/2024. Assinatura concluída via Clicksign.",
  },
  {
    cpf: "03240230577",
    apelido: "Rose",
    pdfPath: `${BASE}\\ONX Corretora\\EQUIPE\\ATIVO\\(salvar assinado) Rosilene Oliveira dos Santos\\2023_01 - Ajuste Particular - Rosilene - Ass.pdf`,
    tipo: "misto",
    regrasEspeciais: `Antecipação de lucros (sócia):
• Retirada fixa mensal: R$ 4.000,00
• Mais 20% da receita líquida da ONX

⚠ Valor e percentuais podem ser alterados unilateralmente pela ONX a cada 6 meses.

Pagamento via transferência bancária até dia 15 do mês subsequente.
Comissionamento divulgado até dia 10. Pessoa tem 48h após recebimento para impugnar.

Vínculo mínimo: 12 meses a partir da assinatura.`,
    dataInicio: new Date("2023-01-17"),
    observacoes:
      "Sócia da Onx Agro Corretora (CNPJ 31.238.019/0001-02). Ajuste particular firmado em 17/01/2023. RG 1347907157. Endereço: Camaçari/BA.",
  },
  {
    cpf: "90042492572",
    apelido: "Leide",
    pdfPath: `${BASE}\\ONIX Imob\\DOCUMENTOS\\EQUIPE\\2025-09-02 - Contrato Leide - Associação em Corretagem.docx - Ass.pdf`,
    tipo: "misto",
    regrasEspeciais: `Remuneração mensal:
• R$ 1.518,00 fixo (participação em atividades de administração imobiliária)

Comissões variáveis sobre comissão líquida da Onix Imob:
• 20% por captação de imóvel para venda ou locação
• 30% por captação de cliente envolvido no fechamento (locação ou venda)
• Cumulativo se mesma pessoa fizer ambos os papéis (ex.: 50% no caso máximo)

Repasse em até 5 dias úteis após recebimento das comissões pela Onix.
Conta: Banco Inter ag. 0001 cc. 1999648-9 PIX nanaplin@hotmail.com.

CRECI/BA 24.763.`,
    dataInicio: new Date("2025-09-03"),
    observacoes:
      "Associação de corretora de imóveis com Onix Imob LTDA (CNPJ 57.646.566/0001-02). Vigente desde 03/09/2025. RG 706320654 SSP/BA. Endereço: Pituba, Salvador/BA.",
  },
  {
    cpf: "04784951539",
    apelido: "Renan",
    pdfPath: `${BASE}\\ONIX Imob\\DOCUMENTOS\\PJ\\Onix Imob Constituição Re. Em. 11.10.24.pdf`,
    tipo: "pro_labore",
    regrasEspeciais: `Sócio fundador / Administrador da Onix Imob LTDA — 25% das quotas.

Cláusula 10ª do Contrato Social: "No exercício da administração, os administradores
terão direito a uma retirada mensal a título de pró-labore, observadas as disposições
regulamentares pertinentes."

Cláusula 11ª — Responsável técnico (CRECI BA 27271).
Distribuição de lucros pode ser desproporcional à participação societária (Cláusula 13ª).`,
    dataInicio: new Date("2024-10-11"),
    observacoes:
      "Sócio administrador da Onix Imob LTDA (CNPJ 57.646.566/0001-02), constituída em 11/10/2024. 2.500 quotas (R$ 2.500,00 — 25%). Administra ISOLADAMENTE em conjunto com Eduardo, Vinicius e Matheus. Responsabilidade técnica via CRECI BA 27271.",
  },
  {
    cpf: "84505729591",
    apelido: "Matheus",
    pdfPath: `${BASE}\\ONIX Imob\\DOCUMENTOS\\PJ\\Onix Imob Constituição Re. Em. 11.10.24.pdf`,
    tipo: "pro_labore",
    regrasEspeciais: `Sócio fundador / Administrador da Onix Imob LTDA — 25% das quotas.

Cláusula 10ª do Contrato Social: "No exercício da administração, os administradores
terão direito a uma retirada mensal a título de pró-labore, observadas as disposições
regulamentares pertinentes."

Cláusula 11ª — Responsável técnico (CRECI BA 23912).
Distribuição de lucros pode ser desproporcional à participação societária (Cláusula 13ª).`,
    dataInicio: new Date("2024-10-11"),
    observacoes:
      "Sócio administrador da Onix Imob LTDA (CNPJ 57.646.566/0001-02), constituída em 11/10/2024. 2.500 quotas (R$ 2.500,00 — 25%). Administra ISOLADAMENTE em conjunto com Eduardo, Vinicius e Renan. Responsabilidade técnica via CRECI BA 23912.",
  },
];

// Mapeia tipo do mime conforme padrão do projeto
const PDF_MIME = "application/pdf";

async function main() {
  console.log("🌱 Acordos comerciais — extraídos dos contratos\n");

  let criados = 0;
  let pulados = 0;
  let erros = 0;

  for (const a of ACORDOS) {
    const pessoa = await prisma.pessoa.findUnique({
      where: { cpf: a.cpf },
      select: { id: true, apelido: true },
    });
    if (!pessoa) {
      console.log(`  ✗ ${a.apelido}: CPF ${a.cpf} não encontrado`);
      erros++;
      continue;
    }

    // Pula se já existe acordo vigente do mesmo tipo
    const vigente = await prisma.acordoComercial.findFirst({
      where: { pessoaId: pessoa.id, dataFim: null, tipo: a.tipo },
      select: { id: true, tipo: true, dataInicio: true },
    });
    if (vigente) {
      console.log(
        `  ↻ ${a.apelido}: já tem acordo vigente (${vigente.tipo} desde ${vigente.dataInicio.toISOString().slice(0, 10)})`,
      );
      pulados++;
      continue;
    }

    // Lê o PDF
    let pdfBase64: string | null = null;
    let pdfBytes: number | null = null;
    let contratoFilename: string | null = null;
    try {
      const buf = fs.readFileSync(a.pdfPath);
      pdfBase64 = buf.toString("base64");
      pdfBytes = buf.length;
      contratoFilename = a.pdfPath.split("\\").pop() ?? null;
    } catch (e) {
      console.log(
        `  ⚠ ${a.apelido}: falha ao ler PDF (${(e as Error).message.slice(0, 80)}) — salvando sem anexo`,
      );
    }

    await prisma.acordoComercial.create({
      data: {
        pessoaId: pessoa.id,
        tipo: a.tipo,
        regrasEspeciais: a.regrasEspeciais,
        dataInicio: a.dataInicio,
        observacoes: a.observacoes,
        contratoFilename,
        contratoMimeType: pdfBase64 ? PDF_MIME : null,
        contratoBase64: pdfBase64,
        contratoBytes: pdfBytes,
      },
    });
    criados++;
    const pdfTag = pdfBase64 ? `📎 ${Math.round((pdfBytes ?? 0) / 1024)}KB` : "(sem PDF)";
    console.log(
      `  ✓ ${a.apelido.padEnd(12)} | ${a.tipo.padEnd(11)} | ${a.dataInicio.toISOString().slice(0, 10)} | ${pdfTag}`,
    );
  }

  console.log(`\n📊 ${criados} criados, ${pulados} pulados, ${erros} erros`);

  const total = await prisma.acordoComercial.count();
  console.log(`Total de acordos no banco: ${total}\n`);

  console.log("✅ Concluído. Acordos visíveis em /time/[id] (admin sempre vê; pessoa vê o próprio).");
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
