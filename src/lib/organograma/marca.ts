/**
 * O nome do nó escrito na forma da MARCA — módulo puro.
 *
 * ── POR QUE ISTO NÃO É UMA TABELA DE NOMES ───────────────────────────────
 * O desenho aprovado escreve as empresas em caixa baixa e sem espaço —
 * `onixcapital`, `oniximob` —, enquanto o banco guarda "Onix Capital" e
 * "Onix Imob". A saída óbvia seria uma tabela de id → nome de marca, e ela
 * seria a mesma armadilha que a #301 já cobrou uma vez: um segundo lugar onde
 * o nome mora, que ninguém lembra de atualizar quando o primeiro muda.
 *
 * Aqui não há nome nenhum escrito. Há uma REGRA TIPOGRÁFICA aplicada sobre o
 * que veio do banco: tira acento, tira espaço, baixa a caixa. Renomear a
 * empresa no banco muda a tela junto, e nada precisa ser lembrado.
 *
 * ── O SUFIXO DOURADO ─────────────────────────────────────────────────────
 * No desenho, "onix" é neutro e o que vem depois é dourado — `onix`+`co`,
 * `onix`+`capital`. A separação é do prefixo comum, não de uma lista: nó que
 * não começa com "onix" (um departamento como "Planejamento Patrimonial")
 * volta inteiro no prefixo, sem dourado, que é o comportamento certo para
 * quem não é marca.
 */

export type Marca = {
  /** A parte neutra. Para quem não é "onix…", é o nome inteiro. */
  prefixo: string;
  /** A parte destacada. Vazia quando não há o que destacar. */
  sufixo: string;
};

const PREFIXO_DA_CASA = "onix";

/** `"Onix Educação"` → `{ prefixo: "onix", sufixo: "educacao" }`. */
export function marcaDoNome(nome: string): Marca {
  const plano = nome
    .normalize("NFD")
    // Combining Diacritical Marks: "ç" e "ã" viram "c" e "a" sem tabela.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (plano.startsWith(PREFIXO_DA_CASA) && plano.length > PREFIXO_DA_CASA.length) {
    return { prefixo: PREFIXO_DA_CASA, sufixo: plano.slice(PREFIXO_DA_CASA.length) };
  }
  return { prefixo: plano, sufixo: "" };
}

/** A marca inteira, sem a separação — para `aria-label`, `title` e afins. */
export function marcaPlana(nome: string): string {
  const { prefixo, sufixo } = marcaDoNome(nome);
  return prefixo + sufixo;
}
