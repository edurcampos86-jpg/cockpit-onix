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
 * GUARDA EXTRA (`externalIdsVistos.size === 0`): uma fonte que responde
 * 200 com ZERO eventos (ICS vazio/HTML, JSON em shape inesperado, lista
 * legitimamente vazia) NÃO é prova de que as reuniões foram canceladas —
 * `fetchOk` continua `true` mas o set fica vazio, e sem esta guarda toda a
 * janela seria apagada. Lista vazia ⇒ não há evidência suficiente ⇒ remove
 * NADA. O tradeoff aceito: uma reunião realmente cancelada só é limpa quando
 * a fonte voltar a trazer pelo menos um evento na janela (sem perda de dado).
 *
 * Sem prisma / sem server-only de propósito: assim é unit-testável.
 */
export function reunioesParaRemover<T extends { externalId: string }>(
  fetchOk: boolean,
  candidatas: T[],
  externalIdsVistos: Set<string>,
): T[] {
  if (!fetchOk) return [];
  if (externalIdsVistos.size === 0) return [];
  return candidatas.filter((c) => !externalIdsVistos.has(c.externalId));
}
