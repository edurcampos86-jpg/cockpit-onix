/* ──────────────────────────────────────────────────────────────
 * "Quais flags estão ligadas?" — UMA definição, módulo PURO.
 *
 * Client-safe de propósito (sem prisma, sem `server-only`): a tela precisa
 * responder isso no browser a cada toggle, e o servidor precisa responder no
 * `/api/health`. Se a função morasse em `estado.ts`, o cliente teria de manter
 * a própria cópia — que é exatamente o problema abaixo.
 *
 * ── Por que existe ──
 * `chavesLigadas()` (o que o smoke cobra) já deriva de `resolverEstadoDasFlags()`
 * (o que a tela mostra), então esses dois NUNCA divergem — são um caminho só.
 * O risco real estava em outro lugar: a expressão
 * `flags.filter((f) => f.ligada === true).map((f) => f.key)` estava escrita à
 * mão em QUATRO lugares (estado.ts, a rota GET, a page e a tabela client). Bastava
 * um deles virar `f.ligada` (truthy) em vez de `f.ligada === true` para uma flag
 * de valor — cujo `ligada` é `null` — passar a contar num lugar e não em outro,
 * e a tela dizer "confere" enquanto o smoke reprova.
 *
 * O parâmetro é ESTRUTURAL (não `EstadoFlag`) para não puxar o tipo de um módulo
 * `server-only` para dentro do bundle do cliente.
 * ────────────────────────────────────────────────────────────── */

export type FlagComEstado = {
  key: string;
  /** `null` em flag de VALOR — não é "desligada", é "não se aplica". */
  ligada: boolean | null;
  /** Valor gravado que o dialeto da flag não reconhece. Ver `registro.ts`. */
  valorNaoReconhecido?: boolean;
};

/**
 * As chaves ligadas, ordenadas.
 *
 * Ordenado porque a comparação do smoke é TEXTUAL (`join(",")` dos dois lados):
 * a mesma configuração em ordem diferente viraria falso positivo de divergência.
 *
 * `=== true` e não truthy: flag de valor tem `ligada: null`, e `null` não pode
 * contar como ligada nem como desligada — ela simplesmente não entra nesta lista.
 */
export function chavesLigadasDe(flags: readonly FlagComEstado[]): string[] {
  return flags
    .filter((f) => f.ligada === true)
    .map((f) => f.key)
    .sort();
}

/**
 * As chaves cujo valor gravado o dialeto NÃO reconhece, ordenadas.
 *
 * Mora aqui, ao lado de `chavesLigadasDe`, pelo mesmo motivo dela: a tela
 * decide o selo no browser e o `/api/health` publica a lista para o smoke
 * cobrar. Duas cópias da mesma condição divergiriam do mesmo jeito que a de
 * "ligada" divergiu — e aqui o custo seria pior, porque a divergência seria
 * entre "a tela avisa" e "o deploy reprova".
 *
 * Ordenada porque a comparação do smoke é textual, como a das ligadas.
 *
 * `=== true` de novo, e não truthy: o campo é opcional no tipo (a tela client
 * já tinha `FlagComEstado` sem ele), então `undefined` precisa contar como
 * "não suspeita", não como ausência de opinião.
 */
export function chavesNaoReconhecidasDe(flags: readonly FlagComEstado[]): string[] {
  return flags
    .filter((f) => f.valorNaoReconhecido === true)
    .map((f) => f.key)
    .sort();
}
