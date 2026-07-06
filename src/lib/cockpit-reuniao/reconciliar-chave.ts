/**
 * Reconciliação DETERMINÍSTICA de chave de fato (Fase 1b-2f) — corrige o BUG A
 * (chave-drift / não-idempotência de reimport).
 *
 * Módulo PURO e testável (sem Prisma, sem I/O). O writer (`gravarFatosRicos`)
 * consome estas funções dentro do `$transaction`.
 *
 * Problema: nas categorias de TÓPICO de texto livre, o LLM free-forma a chave;
 * o mesmo conceito reimportado vira chave diferente e o upsert por
 * (clienteId, campo) EXATO não casa → duplicata. Recon 07/07 provou que os 4
 * grupos de drift compartilham um token-núcleo entre as chaves e que o drift
 * CRUZA categoria (aposentadoria: MEMORAVEL→PROJETO):
 *
 *   projeto:holding-patrimonial        → projeto:holding
 *   projeto:desinvestimento-onco3      → projeto:onco3
 *   memoravel:seguro-vida-inicio       → memoravel:seguro-vida
 *   memoravel:plano-aposentadoria-idade→ projeto:aposentadoria  (cruza categoria)
 *
 * Solução: casar por SUBCONJUNTO de núcleo de tokens (prefixo-tipo e stopwords
 * de qualificador removidos) DENTRO das categorias de tópico juntas; ao casar,
 * reusar a linha existente e colapsar a chave para a CANÔNICA (menos tokens).
 */

/**
 * Categorias de TÓPICO de texto livre — onde o LLM free-forma a chave e o drift
 * de reimport acontece. Reconciliadas JUNTAS (o drift cruza categoria).
 * FAMILIA/IDENTIDADE/SAUDE/METRICA ficam FORA: chave fixa ou derivada
 * (FAMILIA = slug do nome), reconciliadas por (clienteId, campo) exato.
 */
export const CATEGORIAS_TOPICO = ["PROJETO", "MEMORAVEL", "SUCESSAO"] as const;

/**
 * Stopwords de QUALIFICADOR: tokens que só refinam o tópico e NÃO mudam o
 * conceito. Removidos do núcleo antes do casamento por subconjunto. Constante
 * exportada, fácil de estender conforme novos drifts aparecerem.
 */
export const STOPWORDS_QUALIFICADOR: ReadonlySet<string> = new Set([
  "patrimonial",
  "familiar",
  "inicio",
  "fim",
  "plano",
  "idade",
  "desinvestimento",
  "portabilidade",
  "geral",
  "mensal",
  "anual",
  "do",
  "da",
  "de",
  "e",
  "para",
]);

/** Remove acentos (NFD + strip diacríticos). */
function removerAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Tokens BRUTOS do núcleo: remove o prefixo tipo (tudo até o 1º ':'), split por
 * '-', lowercase, sem acento, sem vazios. Ainda inclui as stopwords.
 */
export function tokensBrutos(campo: string): string[] {
  const i = campo.indexOf(":");
  const semPrefixo = i >= 0 ? campo.slice(i + 1) : campo;
  return removerAcento(semPrefixo.toLowerCase())
    .split("-")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Núcleo conceitual: tokens brutos MENOS as stopwords de qualificador. */
export function nucleo(campo: string): Set<string> {
  return new Set(tokensBrutos(campo).filter((t) => !STOPWORDS_QUALIFICADOR.has(t)));
}

function subconjunto(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function intersecaoTamanho(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n += 1;
  return n;
}

/**
 * Chave canônica entre duas: MENOS tokens no núcleo; desempate por menos tokens
 * brutos, depois string mais curta, depois lexicográfica (100% determinístico).
 */
function maisCanonica(a: string, b: string): string {
  const na = nucleo(a).size;
  const nb = nucleo(b).size;
  if (na !== nb) return na < nb ? a : b;
  const ba = tokensBrutos(a).length;
  const bb = tokensBrutos(b).length;
  if (ba !== bb) return ba < bb ? a : b;
  if (a.length !== b.length) return a.length < b.length ? a : b;
  return a <= b ? a : b;
}

/** Um fato de tópico já existente do cliente (só a chave importa aqui). */
export type FatoExistente = { campo: string };

export type DecisaoReconciliacao = {
  acao: "reusar" | "criar";
  /** Chave que a linha deve passar a ter (a curta, quando reusa). */
  campoCanonico: string;
  /** Campo da linha existente a atualizar (null quando cria). */
  campoExistente: string | null;
  motivo: string;
};

/**
 * Decide se `kNovo` é o MESMO conceito de algum `existentes[]` (só campos de
 * tópico). Função PURA.
 *
 *  - Match = núcleos em relação de SUBCONJUNTO (um ⊆ outro) e interseção não-vazia.
 *  - Vários candidatos → maior interseção vence; empate no topo → NÃO reconcilia
 *    (create + motivo 'empate…'; dup raro é melhor que fusão errada).
 *  - Núcleo vazio (só stopwords) nunca casa — evita colar em tudo.
 *  - `kNovo` idêntico a um existente → deixa o upsert por (clienteId, campo)
 *    resolver (motivo 'campo-identico').
 */
export function reconciliarChave(
  kNovo: string,
  existentes: FatoExistente[],
): DecisaoReconciliacao {
  if (existentes.some((e) => e.campo === kNovo)) {
    return { acao: "criar", campoCanonico: kNovo, campoExistente: null, motivo: "campo-identico" };
  }

  const nucNovo = nucleo(kNovo);
  if (nucNovo.size === 0) {
    return { acao: "criar", campoCanonico: kNovo, campoExistente: null, motivo: "nucleo-vazio" };
  }

  const candidatos: { campo: string; inter: number }[] = [];
  for (const ex of existentes) {
    const nucEx = nucleo(ex.campo);
    if (nucEx.size === 0) continue;
    const inter = intersecaoTamanho(nucNovo, nucEx);
    if (inter === 0) continue;
    if (subconjunto(nucNovo, nucEx) || subconjunto(nucEx, nucNovo)) {
      candidatos.push({ campo: ex.campo, inter });
    }
  }

  if (candidatos.length === 0) {
    return { acao: "criar", campoCanonico: kNovo, campoExistente: null, motivo: "sem-match" };
  }

  candidatos.sort((a, b) => b.inter - a.inter);
  const topo = candidatos[0].inter;
  const empatados = candidatos.filter((c) => c.inter === topo);
  if (empatados.length > 1) {
    return {
      acao: "criar",
      campoCanonico: kNovo,
      campoExistente: null,
      motivo: `empate:${empatados.map((c) => c.campo).join("|")}`,
    };
  }

  const alvo = empatados[0].campo;
  const canonico = maisCanonica(kNovo, alvo);
  return {
    acao: "reusar",
    campoCanonico: canonico,
    campoExistente: alvo,
    motivo: canonico === kNovo ? "reconciliado:existente-mais-longa" : "reconciliado:novo-mais-longo",
  };
}

/** Slug estável: lowercase, sem acento, espaços→hífen, só [a-z0-9-]. */
export function slug(s: string): string {
  return removerAcento(s.toLowerCase())
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Chave FAMILIA formalizada (1b-2f): sempre derivada do NOME no writer, não da
 * chave do LLM. Sem nome → cai na chave do LLM (fallback, como hoje).
 */
export function campoFamilia(nome: string | null | undefined, chaveFallback: string): string {
  const s = nome ? slug(nome) : "";
  return s ? `familia:${s}` : chaveFallback;
}
