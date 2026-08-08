/**
 * Regra de profundidade da hierarquia de empresas (Onix Co) — módulo PURO.
 *
 * O grupo tem DOIS níveis: a raiz "Onix Co" e as empresas penduradas nela.
 * Neto não existe — "Onix Imob" não tem sub-empresa.
 *
 * ── POR QUE ISSO NÃO É CONSTRAINT DE BANCO ───────────────────────────────
 * `Empresa.parentId` é auto-relação sem limite de profundidade no schema, de
 * propósito. Limitar em SQL exigiria trigger ou CHECK recursivo, e a régua de
 * 2 níveis é decisão de NEGÓCIO, não invariante de armazenamento: no dia em
 * que uma empresa ganhar subsidiária, mudar a régua tem de ser deploy de
 * código, não migration em tabela viva com o risco de bloqueio que isso traz.
 *
 * O schema aguenta N níveis; este módulo é quem recusa o terceiro.
 *
 * ── PURO DE PROPÓSITO ────────────────────────────────────────────────────
 * Sem Prisma, sem `server-only`, sem I/O. Recebe as empresas como lista e
 * devolve veredito. Isso permite (a) testar sem banco, (b) usar tanto em
 * Server Action quanto em componente cliente, e (c) validar o estado INTEIRO
 * da tabela numa auditoria, não só uma mudança por vez.
 *
 * NESTA FASE nada chama estas funções: a PR-A entrega só a estrutura. Elas
 * existem para que a PR de reparenting não precise inventar a régua no meio
 * de um UPDATE.
 */

/** Raiz = nível 1; empresa do grupo = nível 2. Não há nível 3. */
export const PROFUNDIDADE_MAXIMA = 2;

/** O mínimo que a régua precisa saber sobre uma empresa. */
export type NoEmpresa = {
  id: string;
  parentId: string | null;
};

export type MotivoInvalido =
  /** Empresa apontando para si mesma. */
  | "auto_referencia"
  /** `parentId` que não existe na lista fornecida. */
  | "parent_inexistente"
  /** O pai escolhido já é filho de alguém — o nó viraria neto. */
  | "excede_profundidade"
  /** O nó já tem filhos; ganhar um pai empurraria esses filhos para nível 3. */
  | "no_tem_filhos"
  /** Ciclo detectado ao subir a cadeia de pais. */
  | "ciclo";

export type ResultadoHierarquia =
  | { ok: true }
  | { ok: false; motivo: MotivoInvalido; mensagem: string };

const OK: ResultadoHierarquia = { ok: true };

function invalido(motivo: MotivoInvalido, mensagem: string): ResultadoHierarquia {
  return { ok: false, motivo, mensagem };
}

/** Índice id→nó, para as buscas não serem O(n) dentro de laço. */
function indexar(empresas: readonly NoEmpresa[]): Map<string, NoEmpresa> {
  return new Map(empresas.map((e) => [e.id, e]));
}

/**
 * Profundidade de uma empresa: 1 para raiz, 2 para filha de raiz, e assim por
 * diante. Devolve `null` quando a cadeia é inválida — ciclo, ou pai que não
 * existe na lista.
 *
 * O teto de iterações é o tamanho da lista: uma cadeia mais longa que o número
 * de nós só é possível se houver ciclo. Isso torna a detecção de ciclo um
 * efeito da contagem, sem estrutura auxiliar.
 */
export function profundidadeDe(
  id: string,
  empresas: readonly NoEmpresa[],
): number | null {
  const porId = indexar(empresas);
  let atual = porId.get(id);
  if (!atual) return null;

  let nivel = 1;
  const visitados = new Set<string>([atual.id]);

  while (atual.parentId !== null) {
    if (visitados.has(atual.parentId)) return null; // ciclo
    const pai = porId.get(atual.parentId);
    if (!pai) return null; // pai órfão
    visitados.add(pai.id);
    atual = pai;
    nivel++;
    if (nivel > empresas.length) return null; // salvaguarda
  }

  return nivel;
}

/** A empresa é raiz? (sem pai) */
export function ehRaiz(no: NoEmpresa): boolean {
  return no.parentId === null;
}

/**
 * Pode `noId` passar a ter `parentId` como pai?
 *
 * É a função que a PR de reparenting vai chamar ANTES de cada UPDATE. Recebe
 * o estado ATUAL da tabela; a mudança proposta não precisa estar aplicada.
 *
 * `parentId = null` (virar raiz) é sempre válido para um nó existente: a raiz
 * é nível 1 e nada abaixo dela sobe.
 */
export function validarParent(
  noId: string,
  parentId: string | null,
  empresas: readonly NoEmpresa[],
): ResultadoHierarquia {
  const porId = indexar(empresas);

  const no = porId.get(noId);
  if (!no) {
    return invalido("parent_inexistente", `Empresa "${noId}" não existe.`);
  }

  // Virar raiz nunca quebra a régua: o nó passa a nível 1 e seus eventuais
  // filhos passam a nível 2 — ambos dentro do teto.
  if (parentId === null) return OK;

  if (parentId === noId) {
    return invalido("auto_referencia", `Empresa "${noId}" não pode ser pai de si mesma.`);
  }

  const pai = porId.get(parentId);
  if (!pai) {
    return invalido("parent_inexistente", `Empresa pai "${parentId}" não existe.`);
  }

  // O pai precisa ser raiz. Se ele já tem pai, o nó viraria neto (nível 3).
  if (!ehRaiz(pai)) {
    return invalido(
      "excede_profundidade",
      `"${parentId}" já é filha de "${pai.parentId}". Pendurar "${noId}" nela criaria um ` +
        `terceiro nível, e o grupo tem ${PROFUNDIDADE_MAXIMA}.`,
    );
  }

  // Simétrico: se o nó já tem filhos, ganhar um pai empurra esses filhos para
  // o nível 3. O caso é real — é o que aconteceria ao pendurar na "Onix Co"
  // uma empresa que já tivesse sub-empresa.
  const temFilhos = empresas.some((e) => e.parentId === noId);
  if (temFilhos) {
    return invalido(
      "no_tem_filhos",
      `"${noId}" já tem empresas filhas. Dar um pai a ela jogaria essas filhas para o ` +
        `terceiro nível. Mova as filhas antes.`,
    );
  }

  return OK;
}

/**
 * Valida a tabela INTEIRA. Devolve uma entrada por empresa fora da régua —
 * lista vazia significa hierarquia sã.
 *
 * Serve de auditoria: roda sobre o que já está no banco e responde "algum nó
 * está em nível 3, órfão ou em ciclo?" sem depender de ter interceptado cada
 * escrita. Estado ruim pode entrar por SQL manual ou por seed antigo.
 */
export function validarArvore(
  empresas: readonly NoEmpresa[],
): Array<{ id: string; motivo: MotivoInvalido; mensagem: string }> {
  const porId = indexar(empresas);
  const problemas: Array<{ id: string; motivo: MotivoInvalido; mensagem: string }> = [];

  for (const no of empresas) {
    if (no.parentId === no.id) {
      problemas.push({
        id: no.id,
        motivo: "auto_referencia",
        mensagem: `"${no.id}" aponta para si mesma.`,
      });
      continue;
    }

    if (no.parentId !== null && !porId.has(no.parentId)) {
      problemas.push({
        id: no.id,
        motivo: "parent_inexistente",
        mensagem: `"${no.id}" aponta para "${no.parentId}", que não existe.`,
      });
      continue;
    }

    const nivel = profundidadeDe(no.id, empresas);
    if (nivel === null) {
      problemas.push({
        id: no.id,
        motivo: "ciclo",
        mensagem: `A cadeia de pais de "${no.id}" não chega a uma raiz (ciclo).`,
      });
      continue;
    }

    if (nivel > PROFUNDIDADE_MAXIMA) {
      problemas.push({
        id: no.id,
        motivo: "excede_profundidade",
        mensagem: `"${no.id}" está no nível ${nivel}; o teto é ${PROFUNDIDADE_MAXIMA}.`,
      });
    }
  }

  return problemas;
}
