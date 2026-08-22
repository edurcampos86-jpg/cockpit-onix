/**
 * Régua da hierarquia do grupo (Onix Co) — módulo PURO.
 *
 * O grupo tem TRÊS níveis e três papéis:
 *
 *   holding        "Onix Co"                      — a raiz, única
 *   empresa        Capital, Corretora, Imob…      — pendura na holding
 *   departamento   Expansão, Qualidade, Agro…     — pendura na holding OU
 *                                                    numa empresa
 *
 * ── O PAPEL É DECLARADO, NÃO DEDUZIDO DA PROFUNDIDADE ────────────────────
 * A tentação é ler o tipo pelo nível: 1 = holding, 2 = empresa, 3 =
 * departamento. Ela quebra no primeiro nó real da estrutura: "Expansão" e
 * "Marketing/Mídias Sociais" são DEPARTAMENTOS pendurados direto na holding,
 * no mesmo nível 2 das empresas. Deduzir classificaria as duas como empresa,
 * e o RBAC passaria a tratá-las como pessoa jurídica do grupo.
 *
 * Por isso `tipo` é coluna (`Empresa.tipo`, enum no Postgres) e é ele — não a
 * contagem de saltos até a raiz — quem define o que pode pendurar em quê.
 * A profundidade máxima de 3 é CONSEQUÊNCIA da régua de tipos, não a régua.
 *
 * ── POR QUE ISSO NÃO É CONSTRAINT DE BANCO ───────────────────────────────
 * `Empresa.parentId` é auto-relação sem limite de profundidade no schema, de
 * propósito. Limitar em SQL exigiria trigger ou CHECK recursivo, e a régua é
 * decisão de NEGÓCIO, não invariante de armazenamento: ela já mudou uma vez
 * (2 → 3 níveis, nesta PR) e mudar de novo tem de ser deploy de código, não
 * migration em tabela viva com o risco de bloqueio que isso traz.
 *
 * O que o banco garante é o VOCABULÁRIO — o enum recusa `tipo` fora dos três
 * valores. É a única parte da régua barata de impor em SQL.
 *
 * ── PURO DE PROPÓSITO ────────────────────────────────────────────────────
 * Sem Prisma, sem `server-only`, sem I/O. Recebe os nós como lista e devolve
 * veredito. Isso permite (a) testar sem banco, (b) usar tanto em Server Action
 * quanto em componente cliente, e (c) validar o estado INTEIRO da tabela numa
 * auditoria, não só uma mudança por vez.
 */

/**
 * Teto de profundidade. É CONSEQUÊNCIA da régua de tipos (holding → empresa →
 * departamento), não uma régua paralela: nenhuma combinação válida de tipos
 * produz nível 4. Fica declarado porque `validarArvore` continua checando
 * profundidade — é assim que ciclo e neto entrado por SQL manual aparecem
 * mesmo quando os tipos, isolados, parecem coerentes.
 */
export const PROFUNDIDADE_MAXIMA = 3;

/** Os três papéis. Espelha o enum `TipoNo` de `prisma/schema.prisma`. */
export type TipoNo = "holding" | "empresa" | "departamento";

/** Os três papéis como lista, na ordem hierárquica. Travado contra o schema por teste. */
export const TIPOS: readonly TipoNo[] = ["holding", "empresa", "departamento"] as const;

/**
 * O mínimo que a régua de PROFUNDIDADE precisa saber sobre um nó.
 *
 * Continua sem `tipo` de propósito: `acesso-core.ts` e `auditoria-core.ts`
 * consomem este tipo só para subir a cadeia de pais (quem descende de quem), e
 * essa pergunta não depende de papel nenhum. Exigir `tipo` ali obrigaria todo
 * chamador a carregar uma coluna que não usa.
 */
export type NoEmpresa = {
  id: string;
  parentId: string | null;
};

/** Um nó COM papel — o que a régua de tipos exige. */
export type NoTipado = NoEmpresa & {
  tipo: TipoNo;
};

export type MotivoInvalido =
  /** Empresa apontando para si mesma. */
  | "auto_referencia"
  /** `parentId` que não existe na lista fornecida. */
  | "parent_inexistente"
  /** O pai escolhido já está no último nível — o nó passaria do teto. */
  | "excede_profundidade"
  /** O nó tem descendência funda demais para caber sob o pai escolhido. */
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
 * Profundidade de um nó: 1 para a raiz, 2 para filha de raiz, e assim por
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

/**
 * Quantos níveis a subárvore de `id` ocupa: 1 para folha, 2 para quem tem
 * filho, 3 para quem tem neto. `null` se houver ciclo abaixo.
 *
 * É a metade que faltava para validar um movimento com 3 níveis. Com 2, saber
 * "o nó tem filhos?" bastava; com 3, um nó COM filhos ainda pode ser pendurado
 * na holding — o que não pode é um nó com NETOS.
 */
export function alturaDe(id: string, empresas: readonly NoEmpresa[]): number | null {
  const filhosDe = new Map<string, string[]>();
  for (const e of empresas) {
    if (e.parentId === null) continue;
    const lista = filhosDe.get(e.parentId);
    if (lista) lista.push(e.id);
    else filhosDe.set(e.parentId, [e.id]);
  }

  let nivelAtual = [id];
  const visitados = new Set<string>([id]);
  let altura = 1;

  while (nivelAtual.length > 0) {
    const proximo: string[] = [];
    for (const atual of nivelAtual) {
      for (const filho of filhosDe.get(atual) ?? []) {
        if (visitados.has(filho)) return null; // ciclo abaixo
        visitados.add(filho);
        proximo.push(filho);
      }
    }
    if (proximo.length === 0) break;
    altura++;
    if (altura > empresas.length) return null; // salvaguarda
    nivelAtual = proximo;
  }

  return altura;
}

/** O nó é raiz? (sem pai) */
export function ehRaiz(no: NoEmpresa): boolean {
  return no.parentId === null;
}

/**
 * Pode `noId` passar a ter `parentId` como pai?
 *
 * É a função que o reparenting chama ANTES de cada UPDATE. Recebe o estado
 * ATUAL da tabela; a mudança proposta não precisa estar aplicada.
 *
 * Régua de PROFUNDIDADE apenas — a de tipos é `validarTipos`, sobre a árvore
 * inteira. Separadas porque `reparent.ts` e `acesso-core.ts` trabalham com
 * `NoEmpresa` (sem papel) e a pergunta "cabe no teto?" é respondível sem ele.
 *
 * `parentId = null` (virar raiz) é sempre válido pela profundidade: o nó passa
 * a nível 1 e a subárvore dele sobe junto. Quem recusa raiz que não seja a
 * holding é `validarTipos`.
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

  const altura = alturaDe(noId, empresas);
  if (altura === null) {
    return invalido("ciclo", `A subárvore de "${noId}" tem ciclo.`);
  }

  // Virar raiz nunca estoura o teto: o nó vai para o nível 1 e a subárvore
  // inteira sobe com ele.
  if (parentId === null) {
    return altura > PROFUNDIDADE_MAXIMA
      ? invalido(
          "no_tem_filhos",
          `A subárvore de "${noId}" ocupa ${altura} níveis; o teto é ${PROFUNDIDADE_MAXIMA}.`,
        )
      : OK;
  }

  if (parentId === noId) {
    return invalido("auto_referencia", `Empresa "${noId}" não pode ser pai de si mesma.`);
  }

  const pai = porId.get(parentId);
  if (!pai) {
    return invalido("parent_inexistente", `Empresa pai "${parentId}" não existe.`);
  }

  const nivelDoPai = profundidadeDe(parentId, empresas);
  if (nivelDoPai === null) {
    return invalido("ciclo", `A cadeia de pais de "${parentId}" não chega a uma raiz.`);
  }

  // Pendurar dentro da própria subárvore fecharia um ciclo. `profundidadeDe`
  // não pega este caso porque o estado ATUAL ainda é sadio — o ciclo só
  // existiria depois do movimento.
  if (descendeDe(parentId, noId, empresas)) {
    return invalido(
      "ciclo",
      `"${parentId}" está dentro da subárvore de "${noId}" — o movimento fecharia um ciclo.`,
    );
  }

  // O nó sozinho já não caberia.
  if (nivelDoPai + 1 > PROFUNDIDADE_MAXIMA) {
    return invalido(
      "excede_profundidade",
      `"${parentId}" está no nível ${nivelDoPai}. Pendurar "${noId}" nela criaria o ` +
        `nível ${nivelDoPai + 1}, e o teto é ${PROFUNDIDADE_MAXIMA}.`,
    );
  }

  // O nó caberia sozinho, mas leva a descendência junto. Com 2 níveis bastava
  // perguntar "tem filhos?"; com 3, um nó com filhos ainda cabe sob a holding.
  if (nivelDoPai + altura > PROFUNDIDADE_MAXIMA) {
    return invalido(
      "no_tem_filhos",
      `"${noId}" ocupa ${altura} níveis com a descendência dele. Sob "${parentId}" ` +
        `(nível ${nivelDoPai}) o mais fundo cairia no nível ${nivelDoPai + altura}, e o ` +
        `teto é ${PROFUNDIDADE_MAXIMA}. Mova os filhos antes.`,
    );
  }

  return OK;
}

/** `candidato` está na subárvore de `raizId`? */
function descendeDe(
  candidato: string,
  raizId: string,
  empresas: readonly NoEmpresa[],
): boolean {
  const porId = indexar(empresas);
  let atual = porId.get(candidato);
  const visitados = new Set<string>();

  while (atual && atual.parentId !== null) {
    if (atual.parentId === raizId) return true;
    if (visitados.has(atual.parentId)) return false; // ciclo: para
    visitados.add(atual.parentId);
    atual = porId.get(atual.parentId);
  }

  return false;
}

/**
 * Valida a ESTRUTURA da árvore — profundidade, ciclo, pai órfão. Devolve uma
 * entrada por nó fora da régua; lista vazia significa estrutura sã.
 *
 * Serve de auditoria: roda sobre o que já está no banco e responde "algum nó
 * está fundo demais, órfão ou em ciclo?" sem depender de ter interceptado cada
 * escrita. Estado ruim pode entrar por SQL manual ou por seed antigo.
 *
 * NÃO valida papéis — para isso existe `validarTipos`, que precisa da coluna
 * `tipo`. As duas juntas estão em `validarArvoreCompleta`.
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

/* ── A RÉGUA DE PAPÉIS ───────────────────────────────────────────────────── */

export type MotivoTipo =
  /** Nenhum nó declarado `holding`, mas a árvore não está vazia. */
  | "holding_ausente"
  /** Mais de uma holding. O grupo tem uma matriz só. */
  | "holding_repetida"
  /** A holding tem pai — ela é a raiz por definição. */
  | "holding_com_pai"
  /** Raiz que não é holding: nó solto, fora da estrutura do grupo. */
  | "raiz_sem_ser_holding"
  /** Empresa pendurada em algo que não é a holding. */
  | "empresa_fora_da_holding"
  /** Departamento pendurado em departamento — o quarto nível pela porta dos fundos. */
  | "pai_departamento"
  /** Departamento com filho. Departamento é folha. */
  | "departamento_com_filho";

export type ProblemaTipo = {
  /** O nó culpado, ou `null` quando o problema é da árvore inteira. */
  id: string | null;
  motivo: MotivoTipo;
  mensagem: string;
};

/**
 * Valida os PAPÉIS da árvore inteira.
 *
 * Árvore vazia devolve `[]` — tabela sem linha nenhuma é estado legítimo (é o
 * estado de produção antes do seed), não "holding ausente". A falta de holding
 * só é problema quando existe alguma coisa pendurada em algum lugar.
 *
 * As sete recusas cobrem os dois jeitos de furar a régua de 3 níveis: pelo
 * papel (`empresa` fora da holding, `departamento` dentro de departamento) e
 * pela folha (`departamento` com filho). Um nó só precisa de UM motivo — o
 * laço não acumula recusas redundantes sobre o mesmo id.
 */
export function validarTipos(nos: readonly NoTipado[]): ProblemaTipo[] {
  if (nos.length === 0) return [];

  const porId = new Map(nos.map((n) => [n.id, n]));
  const problemas: ProblemaTipo[] = [];

  const holdings = nos.filter((n) => n.tipo === "holding");
  if (holdings.length === 0) {
    problemas.push({
      id: null,
      motivo: "holding_ausente",
      mensagem: `A árvore tem ${nos.length} nó(s) e nenhum declarado "holding".`,
    });
  }
  for (const extra of holdings.slice(1)) {
    problemas.push({
      id: extra.id,
      motivo: "holding_repetida",
      mensagem: `"${extra.id}" é a segunda holding; a primeira é "${holdings[0].id}". O grupo tem uma matriz só.`,
    });
  }

  const temFilho = new Set(nos.map((n) => n.parentId).filter((p): p is string => p !== null));

  for (const no of nos) {
    if (no.tipo === "holding") {
      if (no.parentId !== null) {
        problemas.push({
          id: no.id,
          motivo: "holding_com_pai",
          mensagem: `A holding "${no.id}" aponta para "${no.parentId}". Ela é a raiz — não pendura em ninguém.`,
        });
      }
      continue;
    }

    if (no.parentId === null) {
      problemas.push({
        id: no.id,
        motivo: "raiz_sem_ser_holding",
        mensagem: `"${no.id}" é ${no.tipo} e está solta como raiz. Só a holding é raiz.`,
      });
      continue;
    }

    const pai = porId.get(no.parentId);
    // Pai inexistente é problema de ESTRUTURA, e `validarArvore` já o reporta.
    // Repetir aqui daria duas entradas para o mesmo defeito.
    if (!pai) continue;

    if (no.tipo === "empresa" && pai.tipo !== "holding") {
      problemas.push({
        id: no.id,
        motivo: "empresa_fora_da_holding",
        mensagem: `A empresa "${no.id}" pendura em "${pai.id}" (${pai.tipo}). Empresa pendura na holding.`,
      });
      continue;
    }

    if (no.tipo === "departamento") {
      if (pai.tipo === "departamento") {
        problemas.push({
          id: no.id,
          motivo: "pai_departamento",
          mensagem: `O departamento "${no.id}" pendura no departamento "${pai.id}". Departamento pendura na holding ou numa empresa.`,
        });
        continue;
      }
      if (temFilho.has(no.id)) {
        problemas.push({
          id: no.id,
          motivo: "departamento_com_filho",
          mensagem: `O departamento "${no.id}" tem nó(s) pendurado(s) nele. Departamento é folha.`,
        });
      }
    }
  }

  return problemas;
}

/**
 * Estrutura E papéis, na ordem em que interessa ler: um pai órfão explica
 * várias recusas de tipo, então a estrutura vem primeiro.
 */
export function validarArvoreCompleta(nos: readonly NoTipado[]): {
  estrutura: ReturnType<typeof validarArvore>;
  tipos: ProblemaTipo[];
  ok: boolean;
} {
  const estrutura = validarArvore(nos);
  const tipos = validarTipos(nos);
  return { estrutura, tipos, ok: estrutura.length === 0 && tipos.length === 0 };
}
