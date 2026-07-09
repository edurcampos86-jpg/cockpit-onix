/**
 * Idempotência do import de reunião (Tarefas pós-reunião · T2.5b) — helpers PUROS.
 *
 * Reimportar a MESMA reunião (mesmo clienteId + data) deixou de criar um registro
 * novo: o import passa a ATUALIZAR o `ReuniaoEstruturada` existente. Estes helpers
 * decidem quando NÃO sobrescrever pendências/próximos passos: se o usuário já
 * marcou algum item como concluído, o reimport preserva a lista (não perde o
 * trabalho). Se nada foi concluído, o conteúdo é atualizado com a extração nova.
 *
 * Casar item-a-item entre reimports é frágil (a IA reparáfrasa — mesmo problema
 * de drift do 1b-2f), então a proteção é no nível da LISTA: tudo-ou-nada.
 */

/** Um item da lista tem `concluido === true`? Tolerante a shape sujo. */
function algumItemConcluido(arr: unknown): boolean {
  return (
    Array.isArray(arr) &&
    arr.some(
      (it) => it != null && typeof it === "object" && (it as { concluido?: unknown }).concluido === true,
    )
  );
}

/**
 * As pendências (`{ assessor, cliente }`) têm ALGUM item concluído? Se sim, o
 * reimport deve preservá-las (não sobrescrever) para não perder a conclusão.
 */
export function pendenciasTemConcluido(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as { assessor?: unknown; cliente?: unknown };
  return algumItemConcluido(o.assessor) || algumItemConcluido(o.cliente);
}

/** Os próximos passos (lista) têm ALGUM item concluído? Mesma regra de proteção. */
export function proximosPassosTemConcluido(v: unknown): boolean {
  return algumItemConcluido(v);
}
