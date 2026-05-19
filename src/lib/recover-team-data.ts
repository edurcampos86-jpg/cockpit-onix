import "server-only";
import { calcularNumerologia } from "./numerologia";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Reidratação do módulo Time.
 *
 * Por quê existe: na migração SQLite -> Postgres (commit 57a0fa5 / PR #30) o
 * baseline foi marcado como aplicado contra um Postgres novo no Railway,
 * e os dados de Pessoa/Filial/Departamento que existiam no SQLite antigo nunca
 * foram migrados. Esta rotina consolida o que os scripts `scripts/seed-*.ts`
 * inseriam (sócios Onix Capital + Imob + Onx Corretora + Qualidade) num único
 * caminho idempotente que pode rodar em prod via /api/admin/recover-team.
 *
 * Idempotência: tudo é upsert por chave natural (Filial.nome, Departamento.nome,
 * Pessoa.cpf). PDFs de contrato não são reidratados (vivem no PC do Eduardo —
 * faz upload pela ficha de cada pessoa depois). Numerologia é recalculada a
 * partir de nome + data de nascimento quando ambos existem.
 */

type FilialSeed = { nome: string; cidade: string; estado: string; isMatriz: boolean };

const FILIAIS: FilialSeed[] = [
  { nome: "Salvador", cidade: "Salvador", estado: "BA", isMatriz: true },
  { nome: "Barreiras", cidade: "Barreiras", estado: "BA", isMatriz: false },
  { nome: "Unaí", cidade: "Unaí", estado: "MG", isMatriz: false },
];

const DEPARTAMENTOS = [
  "Investimentos",
  "Imobiliária",
  "Corretora",
  "Qualidade",
  "Administrativo",
] as const;

type FilialNome = (typeof FILIAIS)[number]["nome"];
type DeptoNome = (typeof DEPARTAMENTOS)[number];

type PessoaSeed = {
  nomeCompleto: string;
  apelido: string;
  cpf: string;
  email: string;
  telefone?: string;
  dataNascimento?: Date;
  cidade: string;
  filialNome: FilialNome;
  departamentoNome: DeptoNome;
  cargoFamilia:
    | "assessor_investimentos"
    | "socio"
    | "imobiliaria"
    | "corretora"
    | "qualidade"
    | "administrativo";
  cargoTitulo: string;
  teamRole: "admin" | "lideranca" | "colaborador";
  dataEntrada: Date;
  status?: "ativo" | "arquivado";
  dataSaida?: Date;
  motivoSaida?: string;
  observacoes: string;
  vincularUserCpf?: string;
};

const DATA_FUNDACAO_ONIX = new Date("2018-07-13");
const DATA_ADMISSAO_MARCELO = new Date("2025-10-28");
const DATA_FUNDACAO_IMOB = new Date("2024-10-11");

const PESSOAS: PessoaSeed[] = [
  // ───────────────────────── Onix Capital AI — 15ª alteração 28/10/2025 ─────────────────────────
  {
    nomeCompleto: "Eduardo Rodrigues Campos",
    apelido: "Eduardo",
    cpf: "01536247529",
    email: "eduardo.rodrigues@onixcapital.com.br",
    dataNascimento: new Date("1986-03-21"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio fundador / Administrador (36,985%)",
    teamRole: "admin",
    dataEntrada: DATA_FUNDACAO_ONIX,
    observacoes:
      "ADMINISTRADOR conjunto/isolado. 73.970 quotas | R$ 850.655,00 | 36,985%. Endereço contrato: Av. Oceânica 1454, Ed. Costa Espanha, Apt. 102 A, Ondina, Salvador/BA, CEP 40170-010.",
    vincularUserCpf: "01536247529",
  },
  {
    nomeCompleto: "Vinicius Cidreira de Assis",
    apelido: "Vinicius",
    cpf: "03653840546",
    email: "vinicius.assis@onixcapital.com.br",
    dataNascimento: new Date("1991-02-02"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio / Administrador (36,985%)",
    teamRole: "admin",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (8,000%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio investidor (médico — CRM 21221) (0,010%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (2,500%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócia (0,010%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócia (1,250%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (1,250%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (4,000%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
    observacoes:
      "8.000 quotas | R$ 92.000,00 | 4,000%. Endereço contrato: Rua Nezinho Pamplona 226, Jardim Ouro Branco, Barreiras/BA, CEP 47802-300.",
  },
  {
    nomeCompleto: "Victor Bittencourt Marques",
    apelido: "Victor",
    cpf: "85523852520",
    email: "victor.marques@onixcapital.com.br",
    dataNascimento: new Date("1996-11-26"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (2,000%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio (7,000%)",
    teamRole: "colaborador",
    dataEntrada: DATA_FUNDACAO_ONIX,
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
    departamentoNome: "Investimentos",
    cargoFamilia: "socio",
    cargoTitulo: "Sócio admitido em 28/10/2025 (0,010%)",
    teamRole: "colaborador",
    dataEntrada: DATA_ADMISSAO_MARCELO,
    observacoes:
      "20 quotas | R$ 230,00 | 0,010% (participação simbólica). Sócio admitido na 15ª alteração. Endereço contrato: Rua Professor Ildefonso de Mesquita 154, Salvador/BA, CEP 40279-020.",
  },

  // ───────────────────────── Onix Imob LTDA (constituição 11/10/2024) ─────────────────────────
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
    dataEntrada: DATA_FUNDACAO_IMOB,
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
    dataEntrada: DATA_FUNDACAO_IMOB,
    observacoes:
      "Onix Imob LTDA (CNPJ 57.646.566/0001-02). 2.500 quotas (R$ 2.500,00 — 25%). Administrador isolado. Responsável técnico (CRECI BA 23912). Email presumido (a confirmar). Endereço contrato: Rua do Jaborandi 363, Caminho das Árvores, Salvador/BA, CEP 41820-520.",
  },
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

  // ───────────────────────── Onx Agro Corretora ─────────────────────────
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
  {
    nomeCompleto: "Rodrigo José Sampaio Oliveira",
    apelido: "Rodrigo",
    cpf: "60752629549",
    email: "rodrigo.sampaio@onixcapital.com.br",
    telefone: "(71) 99985-3113",
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Corretora",
    cargoFamilia: "assessor_investimentos",
    cargoTitulo:
      "Assessor de investimentos Onx Corretora (sócio em formação — 6.000 cotas / 3% se aprovar Ancord até 31/12/2024)",
    teamRole: "colaborador",
    dataEntrada: new Date("2023-06-30"),
    status: "arquivado",
    dataSaida: new Date("2025-01-01"),
    motivoSaida: "saida_voluntaria",
    observacoes:
      "Vínculo com Onx Agro Corretora desde 30/06/2023. Ajuste Particular 2 firmado em 22-29/07/2024. Acordo: R$ 16.000/mês fixo + 40% receita líquida captada diretamente + 30% receita Corporate. Idade 50 em 30/06/2025 (nasceu ~1975). ⚠ ARQUIVADO — Eduardo informou que não está mais no time. Histórico preservado.",
  },

  // ───────────────────────── Qualidade ─────────────────────────
  {
    nomeCompleto: "Adriely Vidal dos Santos",
    apelido: "Adriely",
    cpf: "86075437509",
    email: "qualidade@onixcapital.com.br",
    dataNascimento: new Date("1994-12-06"),
    cidade: "Salvador",
    filialNome: "Salvador",
    departamentoNome: "Qualidade",
    cargoFamilia: "qualidade",
    cargoTitulo: "Estagiária — Qualidade (Administração / UNOPAR)",
    teamRole: "colaborador",
    dataEntrada: new Date("2022-12-01"),
    observacoes:
      "Histórico: Dez/2022 — Contrato PJ de Prestação de Serviços. Set/2023 — Distrato do PJ + novo Termo de Estágio (estagiária em Administração/UNOPAR). Jornada: 30h/sem (10h-16h). RG: 1495143287 SSP/BA. Endereço: Rua Professor Luís Anselmo 15, São Gonçalo, Salvador/BA, CEP 41190-135. Email institucional 'qualidade@onixcapital.com.br' (setorial). Termo de estágio com vigência inicial até 05/09/2024 — pode ter sido prorrogado.",
  },
];

type AcordoSeed = {
  cpf: string;
  apelido: string;
  tipo: "pro_labore" | "split" | "comissao" | "misto";
  regrasEspeciais: string;
  dataInicio: Date;
  observacoes: string;
};

const ACORDOS: AcordoSeed[] = [
  {
    cpf: "02464139564",
    apelido: "Thiago",
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
    tipo: "pro_labore",
    regrasEspeciais: `Sócio fundador / Administrador da Onix Imob LTDA — 25% das quotas.

Cláusula 10ª do Contrato Social: "No exercício da administração, os administradores
terão direito a uma retirada mensal a título de pró-labore, observadas as disposições
regulamentares pertinentes."

Cláusula 11ª — Responsável técnico (CRECI BA 27271).
Distribuição de lucros pode ser desproporcional à participação societária (Cláusula 13ª).`,
    dataInicio: DATA_FUNDACAO_IMOB,
    observacoes:
      "Sócio administrador da Onix Imob LTDA (CNPJ 57.646.566/0001-02), constituída em 11/10/2024. 2.500 quotas (R$ 2.500,00 — 25%). Administra ISOLADAMENTE em conjunto com Eduardo, Vinicius e Matheus. Responsabilidade técnica via CRECI BA 27271.",
  },
  {
    cpf: "84505729591",
    apelido: "Matheus",
    tipo: "pro_labore",
    regrasEspeciais: `Sócio fundador / Administrador da Onix Imob LTDA — 25% das quotas.

Cláusula 10ª do Contrato Social: "No exercício da administração, os administradores
terão direito a uma retirada mensal a título de pró-labore, observadas as disposições
regulamentares pertinentes."

Cláusula 11ª — Responsável técnico (CRECI BA 23912).
Distribuição de lucros pode ser desproporcional à participação societária (Cláusula 13ª).`,
    dataInicio: DATA_FUNDACAO_IMOB,
    observacoes:
      "Sócio administrador da Onix Imob LTDA (CNPJ 57.646.566/0001-02), constituída em 11/10/2024. 2.500 quotas (R$ 2.500,00 — 25%). Administra ISOLADAMENTE em conjunto com Eduardo, Vinicius e Renan. Responsabilidade técnica via CRECI BA 23912.",
  },
];

export type RecoverReport = {
  filiais: { criadas: number; atualizadas: number; nomes: string[] };
  departamentos: { criados: number; atualizados: number; nomes: string[] };
  pessoas: {
    criadas: number;
    atualizadas: number;
    vinculadasAUser: number;
    detalhes: Array<{ apelido: string; cpf: string; status: "criada" | "atualizada" }>;
  };
  acordos: { criados: number; pulados: number; faltouPessoa: number };
  numerologia: { criadas: number; atualizadas: number };
};

export async function recoverTeamData(prisma: PrismaClient): Promise<RecoverReport> {
  const report: RecoverReport = {
    filiais: { criadas: 0, atualizadas: 0, nomes: [] },
    departamentos: { criados: 0, atualizados: 0, nomes: [] },
    pessoas: { criadas: 0, atualizadas: 0, vinculadasAUser: 0, detalhes: [] },
    acordos: { criados: 0, pulados: 0, faltouPessoa: 0 },
    numerologia: { criadas: 0, atualizadas: 0 },
  };

  // 1) Filiais
  for (const f of FILIAIS) {
    const existing = await prisma.filial.findUnique({ where: { nome: f.nome } });
    await prisma.filial.upsert({
      where: { nome: f.nome },
      update: { cidade: f.cidade, estado: f.estado, isMatriz: f.isMatriz },
      create: f,
    });
    if (existing) report.filiais.atualizadas++;
    else report.filiais.criadas++;
    report.filiais.nomes.push(f.nome);
  }

  // 2) Departamentos
  for (const nome of DEPARTAMENTOS) {
    const existing = await prisma.departamento.findUnique({ where: { nome } });
    await prisma.departamento.upsert({
      where: { nome },
      update: {},
      create: { nome },
    });
    if (existing) report.departamentos.atualizados++;
    else report.departamentos.criados++;
    report.departamentos.nomes.push(nome);
  }

  // 3) Mapas auxiliares
  const filiais = await prisma.filial.findMany();
  const filialIdPorNome = new Map(filiais.map((f) => [f.nome, f.id]));
  const departamentos = await prisma.departamento.findMany();
  const departamentoIdPorNome = new Map(departamentos.map((d) => [d.nome, d.id]));

  // 4) Pessoas
  for (const p of PESSOAS) {
    const filialId = filialIdPorNome.get(p.filialNome);
    const departamentoId = departamentoIdPorNome.get(p.departamentoNome);
    if (!filialId || !departamentoId) continue;

    let userId: string | undefined;
    if (p.vincularUserCpf) {
      const user = await prisma.user.findUnique({
        where: { cpf: p.vincularUserCpf },
        select: { id: true },
      });
      if (user) userId = user.id;
    }

    const existing = await prisma.pessoa.findUnique({
      where: { cpf: p.cpf },
      select: { id: true, userId: true },
    });

    const baseData = {
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
      filialId,
      departamentoId,
      observacoes: p.observacoes,
      status: p.status ?? "ativo",
      dataSaida: p.dataSaida ?? null,
      motivoSaida: p.motivoSaida ?? null,
    };

    if (existing) {
      const updateData = {
        ...baseData,
        ...(existing.userId ? {} : userId ? { userId } : {}),
      };
      await prisma.pessoa.update({ where: { id: existing.id }, data: updateData });
      report.pessoas.atualizadas++;
      report.pessoas.detalhes.push({
        apelido: p.apelido,
        cpf: p.cpf,
        status: "atualizada",
      });
    } else {
      await prisma.pessoa.create({
        data: {
          ...baseData,
          cpf: p.cpf,
          ...(userId ? { userId } : {}),
        },
      });
      report.pessoas.criadas++;
      report.pessoas.detalhes.push({
        apelido: p.apelido,
        cpf: p.cpf,
        status: "criada",
      });
    }
    if (userId) report.pessoas.vinculadasAUser++;
  }

  // 5) Numerologia (apenas pessoas com data de nascimento)
  const pessoasComData = await prisma.pessoa.findMany({
    where: { dataNascimento: { not: null } },
    select: { id: true, nomeCompleto: true, dataNascimento: true },
  });
  for (const p of pessoasComData) {
    if (!p.dataNascimento) continue;
    const n = calcularNumerologia(p.nomeCompleto, new Date(p.dataNascimento));
    const existing = await prisma.numerologia.findUnique({ where: { pessoaId: p.id } });
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
    };
    if (existing) {
      await prisma.numerologia.update({
        where: { pessoaId: p.id },
        data: { ...data, calculatedAt: new Date() },
      });
      report.numerologia.atualizadas++;
    } else {
      await prisma.numerologia.create({ data: { pessoaId: p.id, ...data } });
      report.numerologia.criadas++;
    }
  }

  // 6) Acordos comerciais (sem PDF — Eduardo reanexa via UI)
  for (const a of ACORDOS) {
    const pessoa = await prisma.pessoa.findUnique({
      where: { cpf: a.cpf },
      select: { id: true },
    });
    if (!pessoa) {
      report.acordos.faltouPessoa++;
      continue;
    }
    const vigente = await prisma.acordoComercial.findFirst({
      where: { pessoaId: pessoa.id, dataFim: null, tipo: a.tipo },
      select: { id: true },
    });
    if (vigente) {
      report.acordos.pulados++;
      continue;
    }
    await prisma.acordoComercial.create({
      data: {
        pessoaId: pessoa.id,
        tipo: a.tipo,
        regrasEspeciais: a.regrasEspeciais,
        dataInicio: a.dataInicio,
        observacoes: a.observacoes,
      },
    });
    report.acordos.criados++;
  }

  return report;
}
