/**
 * Seed de pessoas novas extraídas dos contratos enviados pelo Eduardo:
 *  - Onix Imob LTDA (constituição 11/10/2024) → Renan, Matheus
 *  - Onx Agro Corretora → Thiago Vergal (intermediação 01/11/2025), Alexandra (prestação serviços 31/01/2024),
 *                          Rosilene (sócia desde 17/01/2023)
 *  - Onix Imob → Leide Ana (associação corretagem 03/09/2025)
 *
 * Também CORRIGE emails de Eduardo, Vinicius e Victor (estavam com padrão errado;
 * o real é nome.sobrenome@onixcapital.com.br).
 *
 * Idempotente: usa upsert por CPF.
 *
 * Uso: npx tsx scripts/seed-novos-times-onix.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calcularNumerologia } from "../src/lib/numerologia";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedNova = {
  nomeCompleto: string;
  apelido: string;
  cpf: string;
  email: string;
  telefone?: string;
  dataNascimento?: Date;
  cidade: string;
  filialNome: "Salvador" | "Barreiras" | "Unaí";
  departamentoNome: "Investimentos" | "Imobiliária" | "Corretora" | "Qualidade" | "Administrativo";
  cargoFamilia: "assessor_investimentos" | "socio" | "imobiliaria" | "corretora" | "qualidade" | "administrativo";
  cargoTitulo: string;
  teamRole: "admin" | "lideranca" | "colaborador";
  dataEntrada: Date;
  observacoes: string;
};

const NOVAS: SeedNova[] = [
  // ── ONIX IMOB (constituição 11/10/2024) ──
  {
    nomeCompleto: "Renan Afonso de Paula",
    apelido: "Renan",
    cpf: "04784951539",
    email: "renan@oniximob.com",
    dataNascimento: new Date("1991-08-09"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Imobiliária",
    cargoFamilia: "imobiliaria",
    cargoTitulo: "Sócio fundador Onix Imob / Administrador (25%) — CRECI BA 27271",
    teamRole: "admin",
    dataEntrada: new Date("2024-10-11"),
    observacoes:
      "Onix Imob LTDA (CNPJ 57.646.566/0001-02). 2.500 quotas (R$ 2.500,00 — 25%). Administrador isolado. Responsável técnico (CRECI BA 27271). Endereço contrato: Rua Clara Nunes 414, Apt. 602, Pituba, Salvador/BA, CEP 41810-425.",
  },
  {
    nomeCompleto: "Matheus Goncalves Conceição Moreira",
    apelido: "Matheus",
    cpf: "84505729591",
    email: "matheus@oniximob.com",
    dataNascimento: new Date("1992-03-18"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Imobiliária",
    cargoFamilia: "imobiliaria",
    cargoTitulo: "Sócio fundador Onix Imob / Administrador (25%) — CRECI BA 23912",
    teamRole: "admin",
    dataEntrada: new Date("2024-10-11"),
    observacoes:
      "Onix Imob LTDA (CNPJ 57.646.566/0001-02). 2.500 quotas (R$ 2.500,00 — 25%). Administrador isolado. Responsável técnico (CRECI BA 23912). Email presumido (a confirmar). Endereço contrato: Rua do Jaborandi 363, Caminho das Árvores, Salvador/BA, CEP 41820-520.",
  },
  // ── ONX AGRO CORRETORA ──
  {
    nomeCompleto: "Thiago Moreira Vergal",
    apelido: "Thiago",
    cpf: "02464139564",
    email: "tvergal@gmail.com",
    telefone: "(71) 99341-4164",
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Corretora",
    cargoFamilia: "corretora",
    cargoTitulo: "Parceiro Onx Corretora — intermediação de negócios",
    teamRole: "colaborador",
    dataEntrada: new Date("2025-11-01"),
    observacoes:
      "Contrato de intermediação de negócios com Onx Agro Corretora (assinado 06/02/2026, vigência desde 01/11/2025). PJ THIAGO MOREIRA VERGAL (CNPJ 63.560.664/0001-25). Acordo: R$ 5.000/mês até jun/2026 (depois R$ 4.000) + 5% sobre comissão líquida + 25% sobre indicações. Endereço contrato: Rua Marcos Pinheiro 70, Torre 05, andar 302, Piatã, Salvador/BA, CEP 41650-472. Conta BTG 0020 1761153-4.",
  },
  {
    nomeCompleto: "Alexandra Gonçalves Viana",
    apelido: "Alexandra",
    cpf: "70214999572",
    email: "alexandra.gviana@gmail.com",
    cidade: "Saubara",
    filialNome: "Salvador",
    departamentoNome: "Corretora",
    cargoFamilia: "corretora",
    cargoTitulo: "Prestadora de serviços de administração — Onx Corretora",
    teamRole: "colaborador",
    dataEntrada: new Date("2024-01-31"),
    observacoes:
      "Contrato de prestação de serviços com Onx Agro Corretora (vigente desde 31/01/2024). PJ DNS TELECOM LTDA (CNPJ 26.715.377/0001-10). Acordo: 1% do faturamento bruto. Sede da PJ em Saubara/BA mas atua na sede de Salvador. Foi testemunha do contrato de associação da Leide (Onix Imob, set/2025).",
  },
  {
    nomeCompleto: "Rosilene Oliveira dos Santos",
    apelido: "Rose",
    cpf: "03240230577",
    email: "rose.oliveira@onxcorretora.com.br",
    cidade: "Camaçari",
    filialNome: "Salvador",
    departamentoNome: "Corretora",
    cargoFamilia: "corretora",
    cargoTitulo: "Sócia Onx Corretora",
    teamRole: "colaborador",
    dataEntrada: new Date("2023-01-17"),
    observacoes:
      "Sócia da Onx Agro Corretora (vínculo desde 17/01/2023). Acordo: antecipação de lucros R$ 4.000/mês fixo + 20% receita líquida (revisado a cada 6 meses). Vínculo mínimo de 12 meses. Endereço contrato: Rua Antônio Felix Martins 795, Parque Verde 1, Camaçari/BA, CEP 42810-043. RG 1347907157.",
  },
  // ── ONIX IMOB — Associada ──
  {
    nomeCompleto: "Leide Ana Ferreira do Nascimento",
    apelido: "Leide",
    cpf: "90042492572",
    email: "corretoraleidenascimento@gmail.com",
    telefone: "(71) 9 9194-3204",
    dataNascimento: new Date("1976-05-24"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Imobiliária",
    cargoFamilia: "imobiliaria",
    cargoTitulo: "Corretora associada Onix Imob — CRECI BA 24763",
    teamRole: "colaborador",
    dataEntrada: new Date("2025-09-03"),
    observacoes:
      "Contrato de associação de corretor de imóveis com Onix Imob (vigente desde 03/09/2025). Acordo: R$ 1.518/mês fixo + 20% sobre captação de imóvel + 30% sobre captação de cliente. RG 706320654 SSP/BA. Endereço contrato: Alameda Gênova 259, Apt. 304, Pituba, Salvador/BA, CEP 41830-470. Conta Banco Inter 0001 1999648-9 PIX nanaplin@hotmail.com.",
  },
];

// Correções de email dos sócios já cadastrados
const CORRECOES_EMAIL: Array<{ cpf: string; novoEmail: string }> = [
  { cpf: "01536247529", novoEmail: "eduardo.rodrigues@onixcapital.com.br" },
  { cpf: "03653840546", novoEmail: "vinicius.assis@onixcapital.com.br" },
  { cpf: "85523852520", novoEmail: "victor.marques@onixcapital.com.br" },
];

async function main() {
  console.log("🌱 Seed novos membros do time Onix\n");

  const filiais = await prisma.filial.findMany();
  const filiaisPorNome = new Map(filiais.map((f) => [f.nome, f]));
  const departamentos = await prisma.departamento.findMany();
  const deptoPorNome = new Map(departamentos.map((d) => [d.nome, d]));

  // ── 1) Correções de email dos sócios ──
  console.log("📧 Corrigindo emails de sócios já cadastrados:");
  for (const c of CORRECOES_EMAIL) {
    const existing = await prisma.pessoa.findUnique({
      where: { cpf: c.cpf },
      select: { id: true, email: true, apelido: true, userId: true },
    });
    if (!existing) {
      console.log(`  ⚠ CPF ${c.cpf} não encontrado — pulando`);
      continue;
    }
    if (existing.email === c.novoEmail) {
      console.log(`  ↻ ${existing.apelido}: já está correto`);
      continue;
    }
    await prisma.pessoa.update({
      where: { id: existing.id },
      data: { email: c.novoEmail },
    });
    // Atualiza User também se houver vínculo
    if (existing.userId) {
      await prisma.user.update({
        where: { id: existing.userId },
        data: { email: c.novoEmail },
      });
    }
    console.log(`  ✓ ${existing.apelido}: ${existing.email} → ${c.novoEmail}`);
  }

  // ── 2) Cadastrar / atualizar pessoas novas ──
  console.log("\n👥 Pessoas novas:");
  let criadas = 0;
  let atualizadas = 0;
  const idsCriados: string[] = [];

  for (const p of NOVAS) {
    const filial = filiaisPorNome.get(p.filialNome);
    const depto = deptoPorNome.get(p.departamentoNome);
    if (!filial || !depto) {
      console.log(`  ✗ ${p.apelido}: filial/departamento não encontrado`);
      continue;
    }

    const existing = await prisma.pessoa.findUnique({
      where: { cpf: p.cpf },
      select: { id: true },
    });

    const data = {
      nomeCompleto: p.nomeCompleto,
      apelido: p.apelido,
      email: p.email,
      telefone: p.telefone ?? null,
      dataNascimento: p.dataNascimento ?? null,
      cidade: p.cidade,
      dataEntrada: p.dataEntrada,
      cargoFamilia: p.cargoFamilia,
      cargoTitulo: p.cargoTitulo,
      teamRole: p.teamRole,
      filialId: filial.id,
      departamentoId: depto.id,
      observacoes: p.observacoes,
    };

    if (existing) {
      await prisma.pessoa.update({ where: { id: existing.id }, data });
      atualizadas++;
      console.log(`  ↻ ${p.apelido} (atualizado)`);
      idsCriados.push(existing.id);
    } else {
      const created = await prisma.pessoa.create({
        data: { ...data, cpf: p.cpf, status: "ativo" },
      });
      criadas++;
      console.log(`  + ${p.apelido} → ${p.filialNome}/${p.departamentoNome}`);
      idsCriados.push(created.id);
    }
  }

  // ── 3) Calcular numerologia das pessoas com data de nascimento ──
  console.log("\n🔮 Numerologia (apenas pessoas com data de nascimento):");
  const pessoasComData = await prisma.pessoa.findMany({
    where: { id: { in: idsCriados }, dataNascimento: { not: null } },
    select: { id: true, apelido: true, nomeCompleto: true, dataNascimento: true },
  });

  for (const p of pessoasComData) {
    if (!p.dataNascimento) continue;
    const n = calcularNumerologia(p.nomeCompleto, new Date(p.dataNascimento));
    await prisma.numerologia.upsert({
      where: { pessoaId: p.id },
      update: {
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
      },
      create: {
        pessoaId: p.id,
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
      },
    });
    const masterTag = n.masterNumbers.length > 0 ? ` ⭐(${n.masterNumbers.join(",")})` : "";
    const karmicoTag = n.karmicos.length > 0 ? ` ⚠(${n.karmicos.join(",")})` : "";
    console.log(
      `  ${p.apelido?.padEnd(12)} CV=${n.caminhoVida} Exp=${n.expressao} Alma=${n.alma} Pers=${n.personalidade} AP=${n.anoPessoal}` +
        masterTag +
        karmicoTag,
    );
  }

  console.log("\n📊 Resumo:");
  console.log(`  + ${criadas} pessoas novas`);
  console.log(`  ↻ ${atualizadas} pessoas atualizadas`);
  console.log(`  📧 ${CORRECOES_EMAIL.length} emails verificados`);
  console.log("\n✅ Concluído.");
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
