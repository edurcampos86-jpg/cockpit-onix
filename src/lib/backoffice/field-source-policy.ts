/**
 * Política de qual fonte BTG pode escrever em qual campo do ClienteBackoffice.
 *
 * Princípio: cada XLSX BTG tem um "domínio de verdade":
 *   - base_btg     → posição financeira (PL, alocação, aportes, datas BTG)
 *   - informacoes  → cadastrais (PF, endereço, suitability, status conta)
 *   - saldo_em_cc  → saldo em conta corrente (apenas saldoConta)
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

export type FonteImport = "base_btg" | "informacoes" | "saldo_em_cc" | "manual";

export const FIELD_SOURCE_POLICY: Record<string, FonteImport[]> = {
  // ── Identidade ─────────────────────────────────────────────────────────
  // Nome curto vem do Base_BTG; informacoes preenche o formal.
  nome: ["base_btg"],
  nomeCompleto: ["informacoes"],
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
  cpfCnpj: ["informacoes", "base_btg"], // cai pro base_btg se Informacoes faltar
  cpfConjuge: ["informacoes"],
  perfilAcesso: ["informacoes"],
  perfilInvestidor: ["informacoes"], // task chama de "perfilSuitability"
  suitabilityValidoAte: ["informacoes"], // task chama de "vencimentoSuitability"
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
  telefone: ["informacoes"],
  email: ["informacoes"], // task chama de "emailAcesso"

  // ── Saldo CC (fonte: saldo_em_cc tem PRIORIDADE; base_btg é fallback) ─
  // Ordem na lista define prioridade: a primeira fonte autorizada que escreveu
  // depois ganha. Pra um campo com 2 fontes, qualquer uma das duas pode
  // escrever — mas saldo_em_cc é o "canônico".
  saldoConta: ["saldo_em_cc", "base_btg"],
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
