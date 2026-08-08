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
