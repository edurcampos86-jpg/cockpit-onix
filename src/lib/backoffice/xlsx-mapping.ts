/**
 * Mapeamento único de cabeçalhos XLSX → campos do ClienteBackoffice.
 *
 * Antes: dados-upload.tsx tinha um parser primitivo (5 variantes de "nome")
 * e clientes-table.tsx tinha um HEADER_MAP completo. Os dois caminhos
 * importavam para o mesmo banco, mas com taxas de aceitação MUITO diferentes
 * — linhas legítimas eram silenciosamente descartadas em um deles e não no
 * outro. Esta lib unifica tudo num único mapping + função.
 *
 * Para descobrir o nome do campo destino a partir de um header bruto:
 *   const target = HEADER_MAP[normHeader("Saldo em CC")];
 *   // → "saldoConta"
 *
 * Quando adicionar um novo campo, lembre de:
 * - Incluir TODAS as variantes que o BTG já produziu (pt-BR com/sem acento,
 *   abreviações, espaço, maiúsculo)
 * - normHeader colapsa case, acentos e tudo que não for [a-z0-9]
 */

export const HEADER_MAP: Record<string, string> = {
  // ── Identidade ────────────────────────────────────────────────────────
  // "nome" curto (Base_BTG, fonte=base_btg). Não mapeie aqui variantes que
  // signifiquem nome completo formal — essas vão pra `nomeCompleto`.
  nome: "nome",
  name: "nome",
  cliente: "nome",
  nomecliente: "nome",
  nomedocliente: "nome",
  titular: "nome",
  nometitular: "nome",
  nomedotitular: "nome",
  razaosocial: "nome",
  // Nome completo formal (Informacoes, fonte=informacoes)
  nomecompleto: "nomeCompleto",
  nomeformal: "nomeCompleto",
  nomedoclienteformal: "nomeCompleto",
  razaosocialcompleta: "nomeCompleto",
  numeroconta: "numeroConta",
  numerodaconta: "numeroConta",
  numero_conta: "numeroConta",
  conta: "numeroConta",
  account: "numeroConta",
  nconta: "numeroConta",
  contacliente: "numeroConta",
  contadocliente: "numeroConta",
  cpf: "cpfCnpj",
  cnpj: "cpfCnpj",
  cpfcnpj: "cpfCnpj",
  taxidentification: "cpfCnpj",
  // NOTA: `documento` e `numerodocumento` agora vão pros campos específicos
  // do Informacoes (`documento` = tipo RG/CNH, `numeroDocumento` = número
  // dele). Antes mapeavam ambíguo pra cpfCnpj.

  // ── AUM / saldo total (PL Total — fonte: base_btg) ───────────────────
  // Várias variantes do MESMO conceito: o valor total da carteira.
  saldo: "saldo",
  saldototal: "saldo",
  aum: "saldo",
  patrimonio: "saldo",
  patrimonioliquido: "saldo",
  patrimonioliquidototal: "saldo",
  patrimoniototal: "saldo",
  balance: "saldo",
  totalbalance: "saldo",
  pltotal: "saldo",
  pl: "saldo",
  totalamount: "saldo",
  totalammount: "saldo", // typo do BTG, mantido por compatibilidade

  // ── Saldo em conta corrente (cash disponível) ────────────────────────
  // Crítico: o relatório oficial BTG é "Saldo em CC" — antes não mapeado.
  saldoconta: "saldoConta",
  saldocontacorrente: "saldoConta",
  saldoemcontacorrente: "saldoConta",
  saldoemcc: "saldoConta",
  saldocc: "saldoConta",
  saldodisponivel: "saldoConta",
  saldoemcaixa: "saldoConta",
  saldocaixa: "saldoConta",
  cash: "saldoConta",
  cashbalance: "saldoConta",
  availablebalance: "saldoConta",
  contacorrente: "saldoConta",
  cc: "saldoConta",
  disponivel: "saldoConta",

  // ── Contato ──────────────────────────────────────────────────────────
  email: "email",
  emailprincipal: "email",
  emailcomunicacao: "email",
  emailacesso: "email",
  telefone: "telefone",
  celular: "telefone",
  fone: "telefone",
  whatsapp: "telefone",
  telefonecelular: "telefone",

  // ── Cadastrais ────────────────────────────────────────────────────────
  profissao: "profissao",
  profession: "profissao",
  ocupacao: "profissao",
  profissaosetor: "profissao",
  setor: "profissao",
  nicho: "nicho",
  segmento: "nicho",
  aniversario: "aniversario",
  dataaniversario: "aniversario",
  datanascimento: "aniversario",
  nascimento: "aniversario",
  estadocivil: "estadoCivil",
  genero: "genero",
  sexo: "genero",
  nacionalidade: "nacionalidade",
  cpfconjuge: "cpfConjuge",
  tipoconta: "tipoConta",
  tipo: "tipoConta",

  // ── Endereço ─────────────────────────────────────────────────────────
  endereco: "endereco",
  endereco1: "endereco",
  enderecoresidencial: "endereco",
  rua: "endereco",
  logradouro: "endereco",
  complemento: "complemento",
  cidade: "cidade",
  municipio: "cidade",
  estado: "estado",
  uf: "estado",
  cep: "cep",

  // ── Status conta + revisões cadastrais ───────────────────────────────
  ativacaodeconta: "ativacaoConta",
  ativacaoconta: "ativacaoConta",
  statusconta: "ativacaoConta",
  statusdaconta: "ativacaoConta",
  situacaoconta: "ativacaoConta",
  situacaodaconta: "ativacaoConta",
  status: "ativacaoConta",
  pendenciacadastral: "pendenciaCadastral",
  pendenciascadastrais: "pendenciaCadastral",
  pendencia: "pendenciaCadastral",
  dataultimarevisaocadastral: "dataUltimaRevisaoCadastral",
  ultimarevisaocadastral: "dataUltimaRevisaoCadastral",
  dataproximarevisaocadastral: "dataProximaRevisaoCadastral",
  proximarevisaocadastral: "dataProximaRevisaoCadastral",
  dataaberturadaconta: "dataAberturaConta",
  datadeaberturadaconta: "dataAberturaConta",
  dataaberturaconta: "dataAberturaConta",
  dataabertura: "dataAberturaConta",
  abertura: "dataAberturaConta",

  // ── Classificação ─────────────────────────────────────────────────────
  classificacao: "classificacao",
  classe: "classificacao",
  abc: "classificacao",

  // ── Receita ───────────────────────────────────────────────────────────
  receita: "receitaAnual",
  receitaanual: "receitaAnual",
  receitaano: "receitaAnual",
  rendaanual: "receitaAnual",

  // ── Suitability ───────────────────────────────────────────────────────
  perfilsuitability: "perfilInvestidor",
  perfilinvestidor: "perfilInvestidor",
  suitability: "perfilInvestidor",
  vencimentosuitability: "suitabilityValidoAte",
  validadesuitability: "suitabilityValidoAte",
  tipoinvestidor: "tipoInvestidor",
  faixacliente: "faixaCliente",
  faixaclient: "faixaCliente",

  // ── Assessor + escritório ─────────────────────────────────────────────
  assessor: "assessorNome",
  assessornome: "assessorNome",
  codigoassessor: "assessorCge",
  codigodoassessor: "assessorCge",
  cgeassessor: "assessorCge",
  cge: "assessorCge",
  emailassessor: "assessorEmail",
  emaildoassessor: "assessorEmail",
  tipoparceiro: "tipoParceiro",
  escritorio: "escritorio",
  codigoescritorio: "codigoEscritorio",
  codigodoescritorio: "codigoEscritorio",
  idcliente: "idClienteBtg",
  idclientebtg: "idClienteBtg",

  // ── Detalhamento financeiro Base_BTG (agora colunas próprias, não só JSON) ──
  fundos: "fundos",
  rendafixa: "rendaFixa",
  rendavariavel: "rendaVariavel",
  previdencia: "previdencia",
  derivativos: "derivativos",
  valoremtransito: "valorEmTransito",
  criptoativos: "criptoativos",
  qtdativos: "qtdAtivos",
  qtddeativos: "qtdAtivos",
  qtdfundos: "qtdFundos",
  qtdrendafixa: "qtdRendaFixa",
  qtdrendavariavel: "qtdRendaVariavel",
  qtdprevidencia: "qtdPrevidencia",
  qtdderivativos: "qtdDerivativos",
  qtdvaloremtransito: "qtdValorEmTransito",
  qtdcriptoativos: "qtdCriptoativos",
  qtdaportes: "qtdAportes",
  qtddeaportes: "qtdAportes",
  aportes: "aportes",
  retiradas: "retiradas",
  primeiroaporte: "primeiroAporte",
  "1aporte": "primeiroAporte",
  ultimoaporte: "ultimoAporte",
  pldeclarado: "plDeclarado",
  carteiraadministrada: "carteiraAdministrada",
  termodemarcacaonacurva: "termoMarcacaoCurva",
  termomarcacaonacurva: "termoMarcacaoCurva",
  contacorrentebase: "contaCorrenteBase",
  // Datas do Base_BTG
  datavinculoassessor: "dataVinculoAssessor",
  datadevinculoassessor: "dataVinculoAssessor",
  datavinculoescritorio: "dataVinculoEscritorio",
  datadevinculoescritorio: "dataVinculoEscritorio",

  // ── Cadastrais Informacoes ────────────────────────────────────────────
  documento: "documento",  // tipo: RG/CNH/Passaporte/etc
  tipodocumento: "documento",
  numerodocumento: "numeroDocumento",
  numerodedocumento: "numeroDocumento",
  dataemissaodocumento: "dataEmissaoDocumento",
  dataemissaododocumento: "dataEmissaoDocumento",
  perfilacesso: "perfilAcesso",
  statustoken: "statusToken",
  idade: "idade",
};

/**
 * Normaliza um cabeçalho de coluna pra lookup no HEADER_MAP.
 * Tira acento, case, espaços e qualquer caractere não [a-z0-9].
 */
export function normHeader(h: string): string {
  return String(h)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function isVazio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

/**
 * Converte uma linha bruta do XLSX em um dict com chaves canônicas (campos
 * do schema). Colunas não mapeadas são silenciosamente ignoradas — quem
 * chama deve registrar isso pra diagnóstico.
 *
 * Devolve TAMBÉM `_headersDesconhecidos`: lista de cabeçalhos que não
 * existem no HEADER_MAP (pra ajudar a debugar XLSX com novo formato).
 */
export interface MappedRow {
  data: Record<string, unknown>;
  headersDesconhecidos: string[];
  headersMapeados: string[];
}

export function mapRowToCliente(row: Record<string, unknown>): MappedRow {
  const out: Record<string, unknown> = {};
  const desconhecidos: string[] = [];
  const mapeados: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    const norm = normHeader(k);
    const target = HEADER_MAP[norm];
    if (!target) {
      if (!isVazio(v)) desconhecidos.push(k);
      continue;
    }
    mapeados.push(target);
    if (isVazio(v)) continue;
    if (isVazio(out[target])) out[target] = v;
  }
  return { data: out, headersDesconhecidos: desconhecidos, headersMapeados: mapeados };
}

// ─── Detecção de tipo de arquivo BTG ───────────────────────────────────────

import type { FonteImport } from "./field-source-policy";

export type FonteDetectada = FonteImport | "desconhecido";

/**
 * Detecta de qual relatório BTG vem um XLSX a partir dos cabeçalhos.
 *
 * Heurística por presença de combinações ASSINATURA (colunas que só
 * aparecem juntas em um dos 3 relatórios). Conservador por design — se
 * não cobre 100%, devolve "desconhecido" e a UI pede confirmação manual.
 *
 * Critérios:
 *   base_btg     → tem 'PL Total' + 'Renda Fixa' + 'Fundos' (alocação)
 *   informacoes  → tem 'Perfil Suitability' E 'Pendência Cadastral'
 *   saldo_em_cc  → tem 'Saldo' + 'Patrimônio Líquido' E número de colunas baixo (<10)
 *
 * Aceita o array bruto (como vem do `Object.keys(rows[0])`) — normaliza
 * internamente.
 */
export function detectarTipoArquivo(headers: string[]): {
  fonte: FonteDetectada;
  motivo: string;
  totalColunas: number;
  totalColunasMapeadas: number;
} {
  const headersNorm = new Set(headers.map(normHeader));
  const totalColunas = headers.length;
  const totalColunasMapeadas = headers.filter((h) => HEADER_MAP[normHeader(h)]).length;

  const has = (...keys: string[]) => keys.every((k) => headersNorm.has(normHeader(k)));

  // Base_BTG: assinatura é alocação detalhada (PL Total + Renda Fixa + Fundos)
  if (has("PL Total", "Renda Fixa", "Fundos")) {
    return {
      fonte: "base_btg",
      motivo: "tem 'PL Total' + 'Renda Fixa' + 'Fundos'",
      totalColunas,
      totalColunasMapeadas,
    };
  }

  // Informacoes: assinatura é cadastral suitability + pendência
  if (has("Perfil Suitability", "Pendência Cadastral") || has("Perfil Suitability", "Pendencia Cadastral")) {
    return {
      fonte: "informacoes",
      motivo: "tem 'Perfil Suitability' + 'Pendência Cadastral'",
      totalColunas,
      totalColunasMapeadas,
    };
  }

  // Saldo_em_CC: poucas colunas + saldo + PL Total
  // O Saldo_em_CC oficial BTG é minimalista (Conta, Cliente, Saldo, PL).
  const temSaldoESaldoTotal =
    (headersNorm.has("saldo") || headersNorm.has("saldocc") || headersNorm.has("saldoemcc")) &&
    (headersNorm.has("patrimonioliquidototal") || headersNorm.has("pltotal") || headersNorm.has("patrimonioliquido"));
  if (temSaldoESaldoTotal && totalColunas < 10) {
    return {
      fonte: "saldo_em_cc",
      motivo: `tem 'Saldo' + 'PL Total' e só ${totalColunas} colunas`,
      totalColunas,
      totalColunasMapeadas,
    };
  }

  return {
    fonte: "desconhecido",
    motivo: `nenhuma assinatura conhecida bateu (${totalColunas} colunas, ${totalColunasMapeadas} mapeadas)`,
    totalColunas,
    totalColunasMapeadas,
  };
}
