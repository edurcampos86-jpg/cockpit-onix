/**
 * Helpers pra escolher qual nome exibir em cada contexto.
 *
 * Por que dois helpers e não um? Porque "relacionamento" (WhatsApp, briefing,
 * sugestão de mensagem) e "formal" (contrato, jurídico, documento PDF) têm
 * regras diferentes:
 *   - relacionamento: apelido > nome curto > nome completo > "Cliente"
 *   - formal:        nome completo > nome curto > "Cliente"
 *
 * Use SEMPRE essas funções em vez de acessar `cliente.nome` direto quando
 * estiver gerando texto pra humano. Acesso direto fica reservado a uso
 * técnico (export CSV, debug, comparison).
 */

export interface NomeFields {
  apelido?: string | null;
  nome?: string | null;
  nomeCompleto?: string | null;
}

/**
 * Para uso em mensagens, WhatsApp, briefings, sugestões de fala,
 * cards do Painel do Dia, scripts da Cadência 12-4-2.
 */
export function getNomeRelacionamento(cliente: NomeFields): string {
  return (
    cliente.apelido?.trim() ||
    cliente.nome?.trim() ||
    cliente.nomeCompleto?.trim() ||
    "Cliente"
  );
}

/**
 * Para uso em documentos, contratos, jurídico, exports formais.
 * Não considera apelido.
 */
export function getNomeFormal(cliente: NomeFields): string {
  return cliente.nomeCompleto?.trim() || cliente.nome?.trim() || "Cliente";
}

/**
 * Primeiro nome — útil pra saudações.
 *   "Roberto Souza Silva" → "Roberto"
 *   apelido "Pimenta"     → "Pimenta"
 */
export function getPrimeiroNomeRelacionamento(cliente: NomeFields): string {
  const completo = getNomeRelacionamento(cliente);
  return completo.split(/\s+/)[0] || completo;
}
