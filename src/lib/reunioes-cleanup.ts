/**
 * Decisão PURA de quais reuniões remover no cleanup de um sync.
 *
 * Os syncs (Google Calendar, Outlook ICS, Datacrazy Atividades) deletam
 * ReuniaoCliente que "sumiram" da fonte: candidatas na janela cujo
 * externalId NÃO apareceu no fetch atual.
 *
 * GUARDA CRÍTICA (`fetchOk`): se a listagem de eventos falhou (token
 * invalid_grant, rede, quota), `externalIdsVistos` fica vazio/parcial e
 * TODA candidata pareceria "sumida" → wipe em massa. Já apagou 171 reuniões
 * num run real. Por isso: fetch falho ⇒ remove NADA.
 *
 * Sem prisma / sem server-only de propósito: assim é unit-testável.
 */
export function reunioesParaRemover<T extends { externalId: string }>(
  fetchOk: boolean,
  candidatas: T[],
  externalIdsVistos: Set<string>,
): T[] {
  if (!fetchOk) return [];
  return candidatas.filter((c) => !externalIdsVistos.has(c.externalId));
}
