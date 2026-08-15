/* ──────────────────────────────────────────────────────────────
 * Vocabulário de `Parceiro.tipo` e `AcordoComercialParceiro.tipoProduto`
 * — módulo PURO, sem banco.
 *
 * ── O BURACO QUE ISTO FECHA ──────────────────────────────────────────────
 * A #318 garante no banco "no máximo um acordo VIGENTE por (parceiroId,
 * tipoProduto)" com um índice parcial único. Mas `tipoProduto` é TEXTO LIVRE,
 * e para o Postgres "assessoria" e "Assessoria" são valores diferentes — então
 * os dois passam pelo índice e o mesmo parceiro fica com DOIS acordos vigentes
 * no mesmo produto. A regra de negócio é furada sem que nenhuma constraint
 * seja violada, e o erro só aparece no fechamento, como comissão dobrada.
 *
 * Normalizar na ESCRITA é o que faz o índice significar o que ele promete.
 *
 * ── POR QUE NORMALIZAR, E NÃO RESTRINGIR A UM ENUM ───────────────────────
 * O texto livre foi decisão deliberada (ver o comentário de `Parceiro.tipo` no
 * schema): a taxonomia de produto ainda muda, e um enum obrigaria migration a
 * cada produto novo descoberto em campo.
 *
 * Estas duas coisas convivem: `normalizar*` SEMPRE devolve um valor gravável,
 * conhecido ou não; `ehTipoProdutoConhecido` responde se ele está na lista, e
 * quem chama decide se avisa, sugere ou aceita em silêncio. Rejeitar o
 * desconhecido aqui reintroduziria o enum pela porta dos fundos — e o primeiro
 * produto novo viraria um erro de validação em vez de uma linha no banco.
 * ────────────────────────────────────────────────────────────── */

/**
 * Chave canônica: minúsculas, sem acento, sem espaço duplo, espaço vira `_`.
 *
 * O `\s+ -> _` é o que faz "seguro resgatável" e "seguro_resgatavel" caírem no
 * mesmo valor — as duas formas aparecem quando alguém digita à mão o que outro
 * copiou de um slug.
 *
 * Reusa a receita de acento de `cockpit-reuniao/derivar.ts:113` (NFD +
 * remoção de diacríticos), que é o precedente da casa.
 */
export function normalizarChaveVocabulario(
  valor: string | null | undefined,
): string | null {
  if (typeof valor !== "string") return null;
  const chave = valor
    .normalize("NFD")
    // Bloco de diacríticos combinantes. Escrito como escape unicode de
    // propósito: os caracteres literais são invisíveis no editor e sobrevivem
    // mal a copy-paste, e um deles perdido aqui devolveria "assessória" e
    // "assessoria" como chaves diferentes — o bug que este módulo existe para
    // matar, reintroduzido dentro dele.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Espaço, underscore, hífen e ponto são todos separadores. Colapsados numa
    // passada só, ANTES de aparar as pontas — na ordem inversa, um "-x-"
    // deixaria underscore sobrando na borda.
    .replace(/[\s_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return chave.length > 0 ? chave : null;
}

// ── tipoProduto ──────────────────────────────────────────────────────────

/**
 * Produtos conhecidos hoje. É uma lista de REFERÊNCIA, não uma restrição:
 * gravar fora dela é permitido e esperado enquanto a taxonomia assenta.
 *
 * Não confundir com `productInterest` de `Lead` (ex.: "consorcio_saude" em
 * src/app/api/relatorio/route.ts:74) — aquilo é interesse de lead no funil de
 * marketing, este é o produto sobre o qual incide comissão de parceiro. Os dois
 * vocabulários se parecem e não são o mesmo; unir os dois é decisão de produto,
 * não de código.
 */
export const TIPOS_PRODUTO = [
  "assessoria",
  "seguro_resgatavel",
  "seguro_risco",
  "previdencia",
  "consorcio",
  "imobiliaria",
] as const;

export type TipoProdutoConhecido = (typeof TIPOS_PRODUTO)[number];

/** Forma canônica de um `tipoProduto`. `null` = entrada vazia ou não-string. */
export function normalizarTipoProduto(
  valor: string | null | undefined,
): string | null {
  return normalizarChaveVocabulario(valor);
}

/** Está na lista de referência? Use para AVISAR, não para bloquear. */
export function ehTipoProdutoConhecido(
  valor: string | null | undefined,
): valor is TipoProdutoConhecido {
  const chave = normalizarTipoProduto(valor);
  return chave !== null && (TIPOS_PRODUTO as readonly string[]).includes(chave);
}

// ── Parceiro.tipo ────────────────────────────────────────────────────────

/**
 * Tipos de parceiro conhecidos — os três que o schema já cita em
 * `Parceiro.tipo`. Mesma natureza de referência, não de restrição.
 */
export const TIPOS_PARCEIRO = ["socio", "contabil", "outro"] as const;

export type TipoParceiroConhecido = (typeof TIPOS_PARCEIRO)[number];

/**
 * Forma canônica de um `Parceiro.tipo`.
 *
 * Mesmo tratamento do produto, e pelo mesmo motivo — `Parceiro.tipo` tem
 * `@@index([tipo])` e alimenta agrupamento por categoria. "Contábil",
 * "contabil" e "CONTABIL" viram três grupos num `groupBy` que deveria ter um.
 */
export function normalizarTipoParceiro(
  valor: string | null | undefined,
): string | null {
  return normalizarChaveVocabulario(valor);
}

/** Está na lista de referência? Use para AVISAR, não para bloquear. */
export function ehTipoParceiroConhecido(
  valor: string | null | undefined,
): valor is TipoParceiroConhecido {
  const chave = normalizarTipoParceiro(valor);
  return chave !== null && (TIPOS_PARCEIRO as readonly string[]).includes(chave);
}
