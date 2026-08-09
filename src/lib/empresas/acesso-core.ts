import type { NoEmpresa } from "@/lib/empresas/hierarquia";

/* ──────────────────────────────────────────────────────────────
 * Quais EMPRESAS uma pessoa enxerga — módulo PURO.
 *
 * Separado da leitura de banco pelo mesmo motivo de `hierarquia.ts`: a regra
 * envolve caminhar numa árvore vinda de dado editável, e caminhada em árvore
 * com `parentId` solto é exatamente onde nasce laço infinito. Isso precisa de
 * teste sem banco.
 *
 * ── A REGRA, e por que ela é assim ───────────────────────────────────────
 * Postura NÃO-DISRUPTIVA, copiada de `resolverCgesVisiveisPorPessoa` em
 * `rbac.ts`: `null` significa SEM FILTRO (vê tudo). Nunca devolve conjunto
 * vazio, que esconderia o grupo inteiro de alguém.
 *
 *   - pessoa sem NENHUMA concessão  -> null (vê tudo)
 *   - concessões que não resolvem   -> null (config incompleta, vê tudo)
 *   - concessões válidas            -> o conjunto delas (+ descendentes)
 *
 * "Sem concessão nenhuma" ser igual a "vê tudo" é deliberado e é o que torna
 * esta mudança inócua no dia do deploy: a tabela nasce vazia, então ninguém
 * passa a ver cadeado. O acesso só começa a restringir para quem GANHAR uma
 * linha — nunca por omissão.
 *
 * ── HERANÇA POR `incluiDescendentes`, e não por decreto ──────────────────
 * A pergunta "acesso à Onix Co dá acesso a tudo abaixo?" é de produto, não de
 * código, e não tinha resposta quando isto foi escrito. Em vez de escolher por
 * baixo do pano, a herança é uma propriedade DE CADA CONCESSÃO. O default é
 * `true`, que é a leitura intuitiva de uma holding; quem quiser conceder só a
 * empresa exata grava `false`. Os dois mundos convivem sem migration nova.
 * ────────────────────────────────────────────────────────────── */

/** Uma linha de `PessoaEmpresa`, reduzida ao que a regra precisa. */
export type ConcessaoEmpresa = {
  empresaId: string;
  /** Estende a concessão às empresas abaixo desta na árvore. */
  incluiDescendentes: boolean;
};

/**
 * Descendentes de `raizId`, sem incluir a própria raiz.
 *
 * À prova de ciclo: um `parentId` mal gravado (A→B→A) faria uma travessia
 * ingênua rodar para sempre e derrubar o processo. O conjunto `vistos` corta
 * isso, e o teto de iterações é o número de nós.
 *
 * Hoje a árvore tem no máximo 2 níveis (`PROFUNDIDADE_MAXIMA` em
 * `hierarquia.ts`), então na prática isto devolve os filhos diretos. Está
 * escrito para N níveis porque a régua é de negócio e pode mudar — e o dia em
 * que mudar não pode ser o dia em que o RBAC silenciosamente para de herdar.
 */
export function descendentesDe(
  raizId: string,
  empresas: readonly NoEmpresa[],
): Set<string> {
  const filhosPorPai = new Map<string, string[]>();
  for (const e of empresas) {
    if (e.parentId === null || e.parentId === e.id) continue;
    const lista = filhosPorPai.get(e.parentId);
    if (lista) lista.push(e.id);
    else filhosPorPai.set(e.parentId, [e.id]);
  }

  const encontrados = new Set<string>();
  const vistos = new Set<string>([raizId]);
  const fila = [raizId];

  while (fila.length > 0) {
    const atual = fila.shift() as string;
    for (const filho of filhosPorPai.get(atual) ?? []) {
      if (vistos.has(filho)) continue; // ciclo ou diamante
      vistos.add(filho);
      encontrados.add(filho);
      fila.push(filho);
    }
  }

  return encontrados;
}

/**
 * Empresas visíveis para a pessoa, ou `null` = SEM FILTRO.
 *
 * `empresas` é a árvore inteira; `concessoes` são as linhas daquela pessoa.
 * Concessão para empresa que não existe na árvore é ignorada — o mesmo
 * critério de `idsTravadosParaDemo`: dado órfão não deve derrubar tela nem,
 * pior, restringir por acidente.
 */
export function empresasVisiveis(
  concessoes: readonly ConcessaoEmpresa[],
  empresas: readonly NoEmpresa[],
): Set<string> | null {
  if (concessoes.length === 0) return null;

  const existe = new Set(empresas.map((e) => e.id));
  const visiveis = new Set<string>();

  for (const c of concessoes) {
    if (!existe.has(c.empresaId)) continue;
    visiveis.add(c.empresaId);
    if (c.incluiDescendentes) {
      for (const d of descendentesDe(c.empresaId, empresas)) visiveis.add(d);
    }
  }

  // Tinha concessão, mas nenhuma resolveu (todas órfãs). Config incompleta ⇒
  // sem filtro, nunca "não vê nada".
  if (visiveis.size === 0) return null;

  return visiveis;
}
