/**
 * Política de qual fonte BTG pode escrever em qual campo do ClienteBackoffice.
 *
 * Princípio: cada XLSX BTG tem um "domínio de verdade":
 *   - base_btg     → posição financeira (PL, alocação, aportes, datas BTG)
 *   - informacoes  → cadastrais (PF, endereço, suitability, status conta)
 *   - saldo_em_cc  → saldo em conta corrente (apenas saldoConta)
 *   - api          → Partner API BTG (sync automático). Cobertura FINA: só o
 *                    que getAccountInformation + getSuitabilityInfo + listAllBalances
 *                    devolvem (ver scripts/btg-discovery.ts). Tudo o que a API
 *                    NÃO traz (profissão, estado civil, PL declarado, renda anual,
 *                    AUM, breakdown) segue vindo do arquivo — `api` NÃO é fonte
 *                    autorizada nesses campos, então upsertPorPolitica os bloqueia.
 *   - manual       → campos editados pelo operador (apelido + observações)
 *
 * Quando há sobreposição (ex.: o Base_BTG também sabe saldoConta via
 * `contaCorrenteBase`, mas o Saldo_em_CC é mais recente e tem prioridade),
 * a lista é ORDENADA pela prioridade — primeiro = mais autoritativo.
 *
 * Aplicação em upserts: ver upsertPorPolitica() abaixo. Ela filtra o payload
 * antes de gravar, descartando silenciosamente fields que a fonte não pode
 * escrever, e registra a fonte+timestamp em `fonteUltimoUpdate`.
 */

export type FonteImport = "base_btg" | "informacoes" | "saldo_em_cc" | "api" | "manual";

export const FIELD_SOURCE_POLICY: Record<string, FonteImport[]> = {
  // ── Identidade ─────────────────────────────────────────────────────────
  // Nome curto vem do Base_BTG; informacoes preenche o formal.
  nome: ["base_btg"],
  // nomeCompleto: o arquivo Base não tem nome completo formal; quem traz é a
  // Partner API (holder.name). `informacoes` mantido por compat com imports antigos.
  nomeCompleto: ["informacoes", "api"],
  // apelido é MANUAL — nenhuma import sobrescreve.
  apelido: ["manual"],

  // ── Posição financeira (fonte: base_btg) ───────────────────────────────
  saldo: ["base_btg"], // PL Total
  fundos: ["base_btg"],
  rendaFixa: ["base_btg"],
  rendaVariavel: ["base_btg"],
  previdencia: ["base_btg"],
  derivativos: ["base_btg"],
  valorEmTransito: ["base_btg"],
  criptoativos: ["base_btg"],
  receitaAnual: ["base_btg"], // task chama de "rendaAnual"
  plDeclarado: ["base_btg"],
  aportes: ["base_btg"],
  retiradas: ["base_btg"],
  primeiroAporte: ["base_btg"],
  ultimoAporte: ["base_btg"],
  qtdAportes: ["base_btg"],
  qtdAtivos: ["base_btg"],
  qtdFundos: ["base_btg"],
  qtdRendaFixa: ["base_btg"],
  qtdRendaVariavel: ["base_btg"],
  qtdPrevidencia: ["base_btg"],
  qtdDerivativos: ["base_btg"],
  qtdValorEmTransito: ["base_btg"],
  qtdCriptoativos: ["base_btg"],
  tipoInvestidor: ["base_btg"],
  faixaCliente: ["base_btg"],
  carteiraAdministrada: ["base_btg"],
  termoMarcacaoCurva: ["base_btg"],
  dataAberturaConta: ["base_btg"],
  dataVinculoAssessor: ["base_btg"],
  dataVinculoEscritorio: ["base_btg"],
  codigoEscritorio: ["base_btg"],
  escritorio: ["base_btg"],
  assessorCge: ["base_btg"], // task chama de "codigoAssessor"
  assessorNome: ["base_btg"],
  assessorEmail: ["base_btg"], // task chama de "emailAssessor"
  idClienteBtg: ["base_btg"], // task chama de "idCliente"
  contaCorrenteBase: ["base_btg"],

  // ── Cadastrais (fonte: informacoes) ────────────────────────────────────
  tipoConta: ["informacoes"],
  documento: ["informacoes"],
  numeroDocumento: ["informacoes"],
  dataEmissaoDocumento: ["informacoes"],
  cpfCnpj: ["informacoes", "base_btg", "api"], // cai pro base_btg se Informacoes faltar; api = holder.taxIdentification
  cpfConjuge: ["informacoes"],
  perfilAcesso: ["informacoes"],
  perfilInvestidor: ["informacoes", "api"], // task chama de "perfilSuitability"; api = getSuitabilityInfo.description
  suitabilityValidoAte: ["informacoes", "api"], // task chama de "vencimentoSuitability"; api = getSuitabilityInfo.expirationDate
  dataUltimaRevisaoCadastral: ["informacoes"],
  dataProximaRevisaoCadastral: ["informacoes"],
  pendenciaCadastral: ["informacoes"],
  ativacaoConta: ["informacoes"],
  statusToken: ["informacoes"],
  idade: ["informacoes"],
  nacionalidade: ["informacoes"],
  genero: ["informacoes"],
  estadoCivil: ["informacoes"],
  endereco: ["informacoes"],
  complemento: ["informacoes"],
  cidade: ["informacoes"],
  estado: ["informacoes"],
  cep: ["informacoes"],
  telefone: ["informacoes", "api"], // api = users[owner].phoneNumber
  email: ["informacoes", "api"], // task chama de "emailAcesso"; api = users[owner].userEmail

  // ── Saldo CC (fonte ÚNICA: saldo_em_cc) ──────────────────────────────
  // saldo_em_cc é o relatório canônico pro saldo em conta corrente. Base BTG
  // até traz a coluna "Conta Corrente" no XLSX, mas (a) reflete um snapshot
  // antigo, (b) sobrescrever o saldo_em_cc por base_btg viola a regra de
  // negócio. Se preciso popular `contaCorrenteBase` (snapshot da base) com
  // o valor da Base BTG, usar campo dedicado — não saldoConta.
  // api = listAllBalances.availableBalance (sync diário). saldo_em_cc mantém
  // prioridade conceitual (relatório canônico), mas o sync diário é mais fresco.
  saldoConta: ["saldo_em_cc", "api"],
};

/**
 * Verifica se uma fonte pode escrever em um campo. Puro, sem DB.
 * Use pra validar permissões em UI ou em testes.
 *
 * Para fazer o upsert respeitando a policy, import direto:
 *   import { upsertPorPolitica } from '@/lib/backoffice/upsert-cliente'
 * (mantemos esse módulo puro pra que testes da policy não puxem prisma)
 */
export function fontePode(campo: string, fonte: FonteImport): boolean {
  return FIELD_SOURCE_POLICY[campo]?.includes(fonte) ?? false;
}
