/**
 * Quem enxerga qual sugestão — módulo PURO (sem Prisma, sem sessão, sem rede).
 *
 * ── A REGRA, EM UMA LINHA ────────────────────────────────────────────────
 * Qualquer pessoa logada CRIA sugestão e vê APENAS as próprias. Admin vê todas.
 *
 * ── POR QUE ISTO EXISTE COMO MÓDULO ──────────────────────────────────────
 * A central de implementações era `admin-only` por um `redirect("/")` de uma
 * linha. Abrir a tela troca UM gate binário por um RECORTE que precisa valer
 * em SEIS lugares: a listagem, as duas contagens do cabeçalho, a métrica de
 * backlog, o PDF de um item e o download de anexo.
 *
 * Seis lugares com a mesma régua escrita à mão é a receita de um deles ficar
 * para trás — e o que ficar para trás não devolve erro: devolve o texto de
 * outra pessoa, em silêncio. Aqui a régua é uma função, e o teste percorre os
 * seis casos.
 *
 * ── O FILTRO É `undefined`, NÃO `{}` ─────────────────────────────────────
 * Para admin, `filtroDeDono` devolve `undefined` — que espalhado num `where`
 * do Prisma não acrescenta cláusula nenhuma. Devolver `{ userId: undefined }`
 * pareceria igual e NÃO é: o Prisma trata `undefined` dentro de um filtro como
 * "ignore este campo", o que dá no mesmo por acidente, mas deixa a intenção
 * ilegível para quem lê depois. A ausência é a intenção.
 */

/** O mínimo que a régua precisa saber de quem está olhando. */
export type QuemOlha = {
  /** `User.id` — a coluna `Implementacao.userId` guarda exatamente isto. */
  userId: string;
  /** `isAdmin` COMPLETO (`User.role` OU `Pessoa.teamRole`). */
  ehAdmin: boolean;
};

/**
 * O `where` a espalhar nas consultas de `Implementacao`.
 *
 *   admin        → `undefined` (sem cláusula: a fila inteira)
 *   qualquer um  → `{ userId }` (só as próprias)
 *
 * Uso: `prisma.implementacao.count({ where: { ...filtroDeDono(quem) } })`.
 */
export function filtroDeDono(quem: QuemOlha): { userId: string } | undefined {
  return quem.ehAdmin ? undefined : { userId: quem.userId };
}

/**
 * Esta pessoa pode abrir ESTA sugestão?
 *
 * Para o caminho de item único (PDF, anexo), onde não há `where` a espalhar e
 * a checagem tem de ser feita DEPOIS de ler a linha — é o caminho pelo qual um
 * id adivinhado ou compartilhado entregaria o item de outra pessoa.
 */
export function podeAbrir(quem: QuemOlha, donoDaSugestao: string): boolean {
  return quem.ehAdmin || quem.userId === donoDaSugestao;
}

/**
 * A métrica de backlog é sobre a fila de QUEM olha.
 *
 * "Quantas ideias viraram entrega" calculado sobre a fila inteira e mostrado a
 * quem só tem duas sugestões não é só impreciso — é vazamento por agregado:
 * o número conta quantas sugestões existem no grupo, e conta em silêncio,
 * porque nenhuma linha de outra pessoa aparece na tela.
 *
 * Existe como função nomeada, e não como mais um `...filtroDeDono()` solto,
 * porque este é o ponto que mais parece inofensivo — e o único que entrega
 * informação sem mostrar nenhuma linha.
 */
export const filtroDaMetrica = filtroDeDono;
