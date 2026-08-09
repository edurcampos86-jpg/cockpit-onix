/* ──────────────────────────────────────────────────────────────
 * O que o smoke pós-deploy ESPERA estar ligado — módulo PURO.
 *
 * O `post-deploy-smoke.yml` compara as flags do ambiente contra a variável
 * `EXPECTED_FLAGS_ON` e fica vermelho quando divergem. Quem liga uma flag pela
 * tela não tinha como saber que acabou de deixar o smoke vermelho; este módulo
 * é o que permite avisar antes.
 *
 * ── Por que a variável tem de existir em DOIS lugares ──
 * No GitHub (Settings → Variables) é ONDE ELA VALE: é lá que o smoke lê, e ela
 * precisa viver FORA do ambiente auditado — uma expectativa guardada dentro do
 * próprio ambiente não prova nada, porque quem mudasse a config mudaria a
 * expectativa junto.
 *
 * No Railway (env var de mesmo nome) é só uma CÓPIA PARA EXIBIR. A tela usa
 * apenas para avisar; ela nunca escreve nem sugere escrever — atualizar a
 * expectativa continua sendo ato manual, no GitHub, por decisão do Eduardo.
 *
 * Consequência aceita: as duas podem sair de sincronia, e aí a tela avisa de
 * uma divergência que não existe (ou cala sobre uma que existe). Por isso a
 * tela rotula de onde veio o dado em vez de apresentá-lo como verdade.
 * ────────────────────────────────────────────────────────────── */

/** Chave da variável de ambiente — o mesmo nome nos dois lugares. */
export const EXPECTED_FLAGS_ON_KEY = "EXPECTED_FLAGS_ON";

/** Sentinela para "nenhuma flag deve estar ligada", igual ao workflow. */
const NENHUMA = "none";

export type ComparacaoEsperado = {
  /** `null` quando a variável não está definida neste ambiente. */
  esperadas: string[] | null;
  /** Esperada ligada, mas está desligada. */
  faltando: string[];
  /** Ligada, mas não está na lista esperada. */
  sobrando: string[];
  /** Alguma das duas listas acima não está vazia. */
  diverge: boolean;
};

/**
 * Normaliza a lista do mesmo jeito que o workflow, para os dois lados
 * compararem a mesma coisa:
 *   `echo "$ESPERADO" | tr ',' '\n' | tr -d '[:space:]' | grep -v '^$' | sort`
 *
 * Ou seja: separa por vírgula, remove TODO espaço (inclusive no meio do token,
 * como o `tr -d` faz), descarta vazios e ordena. Divergir aqui faria a tela
 * dizer "confere" sobre uma lista que o smoke reprova.
 */
function normalizar(bruto: string): string[] {
  const itens = bruto
    .split(",")
    .map((t) => t.replace(/\s+/g, ""))
    .filter((t) => t.length > 0);

  // "none" sozinho significa lista vazia — mesma convenção do workflow.
  if (itens.length === 1 && itens[0].toLowerCase() === NENHUMA) return [];

  return [...itens].sort();
}

/**
 * Compara o que está ligado com o que o smoke espera.
 *
 * Variável ausente ou só espaços ⇒ `esperadas: null` e `diverge: false`: sem
 * expectativa declarada não há divergência, e o workflow também só registra
 * nesse caso. Nunca inventar uma expectativa vazia — isso acusaria como
 * "sobrando" toda flag legitimamente ligada.
 */
export function compararComEsperado(
  ligadas: readonly string[],
  bruto: string | undefined,
): ComparacaoEsperado {
  if (!bruto || !bruto.trim()) return compararComLista(ligadas, null);
  return compararComLista(ligadas, normalizar(bruto));
}

/**
 * A mesma comparação a partir da lista JÁ normalizada.
 *
 * Existe porque a tela precisa RECALCULAR a cada toggle: a comparação chega
 * pronta do servidor, mas assim que o usuário vira uma chave ela envelhece — e
 * um aviso de divergência que não acompanha a própria ação seria pior que
 * nenhum. O servidor manda a lista esperada; o cliente recompara.
 */
export function compararComLista(
  ligadas: readonly string[],
  esperadas: readonly string[] | null,
): ComparacaoEsperado {
  if (esperadas === null) {
    return { esperadas: null, faltando: [], sobrando: [], diverge: false };
  }

  const conjuntoEsperado = new Set(esperadas);
  const conjuntoLigado = new Set(ligadas);

  const faltando = [...esperadas].filter((k) => !conjuntoLigado.has(k)).sort();
  const sobrando = [...ligadas].filter((k) => !conjuntoEsperado.has(k)).sort();

  return {
    esperadas: [...esperadas],
    faltando,
    sobrando,
    diverge: faltando.length > 0 || sobrando.length > 0,
  };
}
