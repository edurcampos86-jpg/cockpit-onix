/* ──────────────────────────────────────────────────────────────
 * Travessia da árvore de parceiros — módulo PURO.
 *
 * Espelha `src/lib/empresas/acesso-core.ts` na forma (funções puras sobre uma
 * lista de nós, testáveis sem banco), mas NÃO no regime. A diferença importa e
 * está registrada aqui para que ninguém a herde por acidente:
 *
 *   - `Empresa` tem PROFUNDIDADE_MAXIMA = 2 por decreto (hierarquia.ts:28) e
 *     ~5 nós. A árvore inteira cabe na cabeça de quem lê.
 *   - `Parceiro` tem profundidade ILIMITADA por decisão de negócio, e a árvore
 *     cresce com a rede comercial. Não há teto natural.
 *
 * Por isso o teto aqui é uma constante EXPLÍCITA deste módulo
 * (`PROFUNDIDADE_MAXIMA_PARCEIROS`), com significado próprio: não é uma regra
 * de negócio, é um limite de segurança da travessia. Ver o comentário dela.
 *
 * ── Por que ainda há Set de vistos, se o banco já tem trigger ────────────
 * A migration 20260811092601 instala `parceiro_sem_ciclo_trg`, que rejeita
 * ciclos na escrita. Este módulo mesmo assim se protege, por três razões
 * concretas:
 *
 *   1. O trigger nasceu DEPOIS da coluna existir. Um ciclo gravado numa janela
 *      anterior (ou num banco restaurado de backup antigo) atravessaria.
 *   2. Estas funções também rodam sobre dado que não veio do banco: fixture de
 *      teste, payload de import, resultado de um merge de planilha.
 *   3. Um laço infinito aqui não devolve erro — trava o processo. O custo de
 *      um `Set` é irrisório perto disso.
 *
 * Defesa em profundidade: o banco impede que entre, o código impede que
 * derrube. Nenhuma das duas torna a outra dispensável.
 * ────────────────────────────────────────────────────────────── */

/**
 * Teto de saltos que qualquer travessia percorre antes de desistir.
 *
 * NÃO é regra de negócio: a rede pode ter a profundidade que quiser. É o
 * limite que transforma "estrutura corrompida" em erro observável em vez de
 * processo pendurado — e ele existe SEPARADO do `Set` de vistos porque os dois
 * pegam coisas diferentes. O `Set` corta ciclo; o teto corta cadeia
 * absurdamente longa que não é ciclo (um import errado encadeando milhares de
 * parceiros em linha, por exemplo).
 *
 * 64 é folgado de propósito: uma rede de indicação real com 64 níveis de
 * profundidade seria notícia antes de ser um problema de software. Se um dia
 * a régua de negócio precisar de mais, o número muda AQUI, num lugar só, e o
 * teste `sobe até o teto declarado` acusa a mudança.
 */
export const PROFUNDIDADE_MAXIMA_PARCEIROS = 64;

/** O mínimo que a régua precisa saber sobre um parceiro. */
export type NoParceiro = {
  id: string;
  /** `Parceiro.indicadoPorParceiroId` — null = raiz (entrou direto). */
  indicadoPorParceiroId: string | null;
};

/** Erro de estrutura: a árvore recebida não é percorrível com segurança. */
export class ArvoreParceirosInvalida extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ArvoreParceirosInvalida";
  }
}

/** Índice id → nó, ignorando duplicatas (a primeira ocorrência vence). */
function indexar(parceiros: readonly NoParceiro[]): Map<string, NoParceiro> {
  const porId = new Map<string, NoParceiro>();
  for (const p of parceiros) if (!porId.has(p.id)) porId.set(p.id, p);
  return porId;
}

/**
 * Sobe a cadeia a partir de `parceiroId` e devolve a RAIZ — o parceiro para
 * quem a comissão sobe.
 *
 * Devolve `null` quando `parceiroId` não existe na lista: id órfão não deve
 * derrubar tela nem, pior, apontar comissão para o parceiro errado. Mesmo
 * critério de `empresasVisiveis` com concessão órfã.
 *
 * Um parceiro raiz é a própria raiz de si mesmo — a função é total, e quem
 * chama não precisa tratar "não tem pai" como caso especial.
 *
 * Lança `ArvoreParceirosInvalida` se encontrar ciclo ou estourar o teto:
 * responder um valor qualquer aqui significaria pagar comissão para alguém
 * escolhido por acidente, o que é pior do que falhar alto.
 */
export function ascender(
  parceiroId: string,
  parceiros: readonly NoParceiro[],
): NoParceiro | null {
  const porId = indexar(parceiros);
  let atual = porId.get(parceiroId);
  if (!atual) return null;

  const vistos = new Set<string>([atual.id]);
  let saltos = 0;

  while (atual.indicadoPorParceiroId !== null) {
    if (++saltos > PROFUNDIDADE_MAXIMA_PARCEIROS) {
      throw new ArvoreParceirosInvalida(
        `Cadeia de indicação acima de "${parceiroId}" passou de ${PROFUNDIDADE_MAXIMA_PARCEIROS} saltos.`,
      );
    }

    const pai = porId.get(atual.indicadoPorParceiroId);
    // Pai apontado mas ausente da lista: a cadeia termina onde a informação
    // termina. Devolver o último nó conhecido é melhor que null — quem chama
    // recebe a raiz VISÍVEL, que é a resposta certa para um recorte parcial
    // da árvore (uma consulta por escopo RBAC, por exemplo).
    if (!pai) return atual;

    if (vistos.has(pai.id)) {
      throw new ArvoreParceirosInvalida(
        `Ciclo na árvore de parceiros ao subir de "${parceiroId}": "${pai.id}" já havia sido visitado.`,
      );
    }
    vistos.add(pai.id);
    atual = pai;
  }

  return atual;
}

/**
 * Subárvore de `parceiroId` — todos os que ele trouxe, direta ou
 * indiretamente. NÃO inclui o próprio `parceiroId`, igual a `descendentesDe`
 * em acesso-core.ts.
 *
 * É a travessia que soma AUM de rede: os clientes vigentes destes parceiros
 * mais os do próprio.
 *
 * À prova de ciclo pelo `Set` de vistos (um ciclo faz a fila fechar em vez de
 * rodar para sempre) e à prova de cadeia absurda pelo teto de profundidade,
 * que aqui conta NÍVEIS a partir da raiz pedida.
 */
export function descendentes(
  parceiroId: string,
  parceiros: readonly NoParceiro[],
): Set<string> {
  const filhosPorPai = new Map<string, string[]>();
  for (const p of parceiros) {
    const pai = p.indicadoPorParceiroId;
    // Auto-referência não vira aresta: seria um ciclo de comprimento 1 e o
    // banco a rejeita, mas fixture e import não passam pelo banco.
    if (pai === null || pai === p.id) continue;
    const lista = filhosPorPai.get(pai);
    if (lista) lista.push(p.id);
    else filhosPorPai.set(pai, [p.id]);
  }

  const encontrados = new Set<string>();
  const vistos = new Set<string>([parceiroId]);
  let fronteira = [parceiroId];
  let nivel = 0;

  while (fronteira.length > 0) {
    if (++nivel > PROFUNDIDADE_MAXIMA_PARCEIROS) {
      throw new ArvoreParceirosInvalida(
        `Subárvore de "${parceiroId}" passou de ${PROFUNDIDADE_MAXIMA_PARCEIROS} níveis.`,
      );
    }

    const proxima: string[] = [];
    for (const atual of fronteira) {
      for (const filho of filhosPorPai.get(atual) ?? []) {
        if (vistos.has(filho)) continue; // ciclo ou diamante
        vistos.add(filho);
        encontrados.add(filho);
        proxima.push(filho);
      }
    }
    fronteira = proxima;
  }

  return encontrados;
}
