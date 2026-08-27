/* ──────────────────────────────────────────────────────────────
 * Vocabulário de `Parceiro.tipo` — módulo PURO, sem banco.
 *
 * ── ENCOLHEU, E ISSO É O DESENHO FUNCIONANDO ─────────────────────────────
 * Este módulo nasceu (#329) cuidando de DOIS campos de texto livre:
 * `Parceiro.tipo` e `AcordoComercialParceiro.tipoProduto`. O segundo virou FK
 * para `Empresa`, e a FK garante melhor do que a normalização garantia: com
 * chave estrangeira não existe "Assessoria" e "assessoria" como dois valores,
 * porque não existe valor fora da tabela.
 *
 * Sobrou a metade que ainda é texto livre. `Parceiro.tipo` continua assim de
 * propósito — a relação com a casa muda mais devagar que a estrutura dela, e
 * um enum aqui obrigaria migration a cada relação nova.
 *
 * `normalizar*` SEMPRE devolve um valor gravável, conhecido ou não;
 * `ehTipoParceiroConhecido` responde se ele está na lista, e quem chama decide
 * se avisa, sugere ou aceita em silêncio. Rejeitar o desconhecido aqui
 * reintroduziria o enum pela porta dos fundos.
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
