/**
 * Seed de pessoas a partir do contrato social da Onix Capital AI LTDA
 * (15ª alteração contratual, registrada em 28/10/2025).
 *
 * Idempotente: usa upsert por CPF. Pode rodar múltiplas vezes sem duplicar.
 *
 * Uso: npx tsx scripts/seed-pessoas-onix-capital.ts
 *
 * Observações:
 * - Email é PRESUMIDO no padrão `primeiro@onixcapital.com.br` (Eduardo confirma e edita).
 * - Telefone não consta no contrato — fica null.
 * - dataEntrada usa 13/07/2018 (fundação da PJ) para fundadores e datas dos 3 sócios admitidos
 *   após a fundação a partir das alterações posteriores. Marcelo entrou em 28/10/2025 (esta alteração).
 * - Sócios retirantes (Humberto, Alan, Laiane) NÃO entram — saíram nesta alteração.
 * - Eduardo é vinculado ao User admin existente (eduardo@onixcapital.com.br).
 * - cargoFamilia = "socio" para todos (estão no contrato como sócios). Eduardo reatribui se precisar.
 * - teamRole = "admin" para Eduardo e Vinicius (ADMINISTRADORES no contrato),
 *   "colaborador" para os demais. Eduardo promove a "lideranca" quem for.
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedPessoa = {
  nomeCompleto: string;
  apelido: string;
  cpf: string;
  email: string;
  dataNascimento: Date;
  cidade: string;
  filialNome: "Salvador" | "Barreiras" | "Unaí";
  cargoTitulo: string;
  teamRole: "admin" | "lideranca" | "colaborador";
  observacoes: string;
  // Se já existe User (caso do Eduardo), conecta
  vincularUserCpf?: string;
};

const PESSOAS: SeedPessoa[] = [
  {
    nomeCompleto: "Eduardo Rodrigues Campos",
    apelido: "Eduardo",
    cpf: "01536247529",
    email: "eduardo@onixcapital.com.br",
    dataNascimento: new Date("1986-03-21"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio fundador / Administrador (36,985%)",
    teamRole: "admin",
    observacoes:
      "ADMINISTRADOR conjunto/isolado. 73.970 quotas | R$ 850.655,00 | 36,985%. Endereço contrato: Av. Oceânica 1454, Ed. Costa Espanha, Apt. 102 A, Ondina, Salvador/BA, CEP 40170-010.",
    vincularUserCpf: "01536247529",
  },
  {
    nomeCompleto: "Vinicius Cidreira de Assis",
    apelido: "Vinicius",
    cpf: "03653840546",
    email: "vinicius@onixcapital.com.br",
    dataNascimento: new Date("1991-02-02"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio / Administrador (36,985%)",
    teamRole: "admin",
    observacoes:
      "ADMINISTRADOR conjunto/isolado. 73.970 quotas | R$ 850.655,00 | 36,985%. Endereço contrato: Rua Embira 154, Ed. Platino Torre Irídio, Apt. 2402, Patamares, Salvador/BA, CEP 41680-113.",
  },
  {
    nomeCompleto: "Gustavo de Souza Nascimento",
    apelido: "Gustavo Nascimento",
    cpf: "05779181500",
    email: "gustavo.nascimento@onixcapital.com.br",
    dataNascimento: new Date("1995-02-18"),
    cidade: "Unaí",
    filialNome: "Unaí",
    cargoTitulo: "Sócio (8,000%)",
    teamRole: "colaborador",
    observacoes:
      "16.000 quotas | R$ 184.000,00 | 8,000%. Endereço contrato: Av. Jose Luís Adjunto 691, Apt. 303, Centro, Unaí/MG, CEP 38610-066.",
  },
  {
    nomeCompleto: "Diego de Oliveira e Almeida Silva",
    apelido: "Diego",
    cpf: "83741887587",
    email: "diego@onixcapital.com.br",
    dataNascimento: new Date("1985-02-21"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio investidor (médico — CRM 21221) (0,010%)",
    teamRole: "colaborador",
    observacoes:
      "20 quotas | R$ 230,00 | 0,010% (participação simbólica). CRM nº 21221 (médico). Endereço contrato: Av. Luís Viana Filho 87, Apt. 1404, Bl. 13, Cond. Le Parc, Patamares, Salvador/BA, CEP 41680-400.",
  },
  {
    nomeCompleto: "Gustavo de Barros Diniz",
    apelido: "Gustavo Diniz",
    cpf: "04289603599",
    email: "gustavo.diniz@onixcapital.com.br",
    dataNascimento: new Date("1991-01-02"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio (2,500%)",
    teamRole: "colaborador",
    observacoes:
      "5.000 quotas | R$ 57.500,00 | 2,500%. Endereço contrato: Rua Colmar Americano da Costa 121, Edif. Villa Inglesa, Apt. 102-C, Pituba, Salvador/BA, CEP 41830-600.",
  },
  {
    nomeCompleto: "Ana Carolina de Vasconcelos",
    apelido: "Ana Carolina",
    cpf: "01629010626",
    email: "ana@onixcapital.com.br",
    dataNascimento: new Date("1986-08-21"),
    cidade: "Unaí",
    filialNome: "Unaí",
    cargoTitulo: "Sócia (0,010%)",
    teamRole: "colaborador",
    observacoes:
      "20 quotas | R$ 230,00 | 0,010% (participação simbólica). Endereço contrato: Rua Djalma Torres 375, Apt. 201, Centro, Unaí/MG, CEP 38610-036.",
  },
  {
    nomeCompleto: "Rafaela de Oliveira Gonçalves",
    apelido: "Rafaela",
    cpf: "85783362590",
    email: "rafaela@onixcapital.com.br",
    dataNascimento: new Date("1995-05-29"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócia (1,250%)",
    teamRole: "colaborador",
    observacoes:
      "2.500 quotas | R$ 28.750,00 | 1,250%. Endereço contrato: Alameda dos Jasmins 200, Apt. 604, Caminho das Árvores, Salvador/BA, CEP 40296-200.",
  },
  {
    nomeCompleto: "Pedro Henrique Ribeiro Vital",
    apelido: "Pedro Henrique",
    cpf: "10085672645",
    email: "pedro@onixcapital.com.br",
    dataNascimento: new Date("1994-12-04"),
    cidade: "Unaí",
    filialNome: "Unaí",
    cargoTitulo: "Sócio (1,250%)",
    teamRole: "colaborador",
    observacoes:
      "2.500 quotas | R$ 28.750,00 | 1,250%. Endereço contrato: Av. Vereador João Narciso 508, Cachoeira, Unaí/MG, CEP 38610-298.",
  },
  {
    nomeCompleto: "Maxsuel dos Santos de Jesus",
    apelido: "Maxsuel",
    cpf: "02459271581",
    email: "maxsuel@onixcapital.com.br",
    dataNascimento: new Date("1988-07-06"),
    cidade: "Barreiras",
    filialNome: "Barreiras",
    cargoTitulo: "Sócio (4,000%)",
    teamRole: "colaborador",
    observacoes:
      "8.000 quotas | R$ 92.000,00 | 4,000%. Endereço contrato: Rua Nezinho Pamplona 226, Jardim Ouro Branco, Barreiras/BA, CEP 47802-300.",
  },
  {
    nomeCompleto: "Victor Bittencourt Marques",
    apelido: "Victor",
    cpf: "85523852520",
    email: "victor@onixcapital.com.br",
    dataNascimento: new Date("1996-11-26"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio (2,000%)",
    teamRole: "colaborador",
    observacoes:
      "4.000 quotas | R$ 46.000,00 | 2,000%. Endereço contrato: Rua Waldemar Falcão 1804, Apt. 301, Horto Florestal, Salvador/BA, CEP 40295-010.",
  },
  {
    nomeCompleto: "Daniel Saraiva Santos Filho",
    apelido: "Daniel",
    cpf: "09175651777",
    email: "daniel@onixcapital.com.br",
    dataNascimento: new Date("1981-08-07"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio (7,000%)",
    teamRole: "colaborador",
    observacoes:
      "14.000 quotas | R$ 161.000,00 | 7,000%. Endereço contrato: Rua Manoel Gomes de Mendonça 57, Apt. 501, Pituba, Salvador/BA, CEP 41810-820.",
  },
  {
    nomeCompleto: "Marcelo de Araujo Costa Penna",
    apelido: "Marcelo",
    cpf: "03423981563",
    email: "marcelo@onixcapital.com.br",
    dataNascimento: new Date("1988-07-19"),
    cidade: "Salvador",
    filialNome: "Salvador",
    cargoTitulo: "Sócio admitido em 28/10/2025 (0,010%)",
    teamRole: "colaborador",
    observacoes:
      "20 quotas | R$ 230,00 | 0,010% (participação simbólica). Sócio admitido nesta 15ª alteração. Endereço contrato: Rua Professor Ildefonso de Mesquita 154, Salvador/BA, CEP 40279-020.",
  },
];

async function main() {
  console.log("🌱 Seed de pessoas — Onix Capital AI (15ª alteração 28/10/2025)\n");

  // Garantir filiais (devem já existir, mas idempotente)
  const filiais = await prisma.filial.findMany();
  const filiaisPorNome = new Map(filiais.map((f) => [f.nome, f]));

  const departamentoInvestimentos = await prisma.departamento.findUnique({
    where: { nome: "Investimentos" },
  });
  if (!departamentoInvestimentos) {
    throw new Error(
      "Departamento 'Investimentos' não existe. Rode `npm run db:seed:time` primeiro.",
    );
  }

  const dataFundacao = new Date("2018-07-13"); // Onix Capital AI LTDA — registro em 13/07/2018
  const dataAdmissaoMarcelo = new Date("2025-10-28"); // 15ª alteração

  let criados = 0;
  let atualizados = 0;
  let vinculadosUser = 0;

  for (const p of PESSOAS) {
    const filial = filiaisPorNome.get(p.filialNome);
    if (!filial) {
      console.error(`  ✗ Filial '${p.filialNome}' não encontrada para ${p.apelido}`);
      continue;
    }

    // Procurar User existente pelo CPF (caso do Eduardo)
    let userId: string | undefined = undefined;
    if (p.vincularUserCpf) {
      const user = await prisma.user.findUnique({
        where: { cpf: p.vincularUserCpf },
        select: { id: true },
      });
      if (user) {
        userId = user.id;
      }
    }

    // Determinar dataEntrada
    const dataEntrada =
      p.cpf === "03423981563" ? dataAdmissaoMarcelo : dataFundacao;

    const existing = await prisma.pessoa.findUnique({
      where: { cpf: p.cpf },
      select: { id: true, userId: true },
    });

    const data = {
      nomeCompleto: p.nomeCompleto,
      apelido: p.apelido,
      email: p.email,
      dataNascimento: p.dataNascimento,
      cidade: p.cidade,
      dataEntrada,
      cargoFamilia: "socio",
      cargoTitulo: p.cargoTitulo,
      teamRole: p.teamRole,
      filialId: filial.id,
      departamentoId: departamentoInvestimentos.id,
      observacoes: p.observacoes,
      // Não sobrescrever userId existente se já estiver vinculado
      ...(existing?.userId ? {} : userId ? { userId } : {}),
    };

    if (existing) {
      await prisma.pessoa.update({ where: { id: existing.id }, data });
      atualizados++;
      console.log(`  ↻ ${p.apelido.padEnd(20)} (atualizado)`);
    } else {
      await prisma.pessoa.create({
        data: {
          ...data,
          cpf: p.cpf,
          status: "ativo",
        },
      });
      criados++;
      console.log(`  + ${p.apelido.padEnd(20)} (novo)${userId ? " 🔗 User vinculado" : ""}`);
    }
    if (userId) vinculadosUser++;
  }

  console.log("\n📊 Resultado:");
  console.log(`  Criados:           ${criados}`);
  console.log(`  Atualizados:       ${atualizados}`);
  console.log(`  Vinculados a User: ${vinculadosUser}`);

  // Distribuição por filial
  const distFilial = await prisma.pessoa.groupBy({
    by: ["filialId"],
    where: { status: "ativo" },
    _count: { _all: true },
  });
  console.log("\n📍 Distribuição por filial:");
  for (const d of distFilial) {
    const f = filiais.find((x) => x.id === d.filialId);
    console.log(`  ${f?.nome ?? "?"}: ${d._count._all}`);
  }

  console.log("\n✅ Seed concluído.");
  console.log("   Próximos passos:");
  console.log("   1. Eduardo conferir e ajustar emails (atual = padrão presumido)");
  console.log("   2. Eduardo gerar convites em /time/[id] para cada pessoa");
  console.log("   3. Atribuir teamRole = 'lideranca' para quem for líder direto");
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
