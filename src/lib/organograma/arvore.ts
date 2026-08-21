import type { TipoNo } from "@/generated/prisma/enums";

/**
 * A árvore do grupo no formato que a tela desenha — módulo PURO.
 *
 * ── POR QUE NÃO REAPROVEITAR `NOS_ECOSSISTEMA` ──────────────────────────
 * O hub de hoje lê `lib/hub-ecossistema/nos.ts`, que declara 9 nós PLANOS —
 * uma órbita, não uma árvore. O catálogo (`lib/empresas/catalogo.ts`) declara
 * os 20, com `tipo`, `parentId` e `transversal`, e é dele que a migration e o
 * seed saíram: é o mesmo conteúdo que está em `Empresa` agora.
 *
 * Duas listas descrevendo o mesmo grupo divergem — foi assim que `imobiliaria`
 * viveu meses com nome diferente do catálogo. O organograma lê a lista longa, e
 * a curta continua servindo só à órbita antiga enquanto ela existir.
 *
 * ── O QUE ESTE MÓDULO NÃO DECIDE ────────────────────────────────────────
 * Não decide ACESSO: recebe o conjunto de travados já resolvido. Não decide
 * ROTA: recebe o mapa. Não toca banco. Assim a régua da árvore — quem pendura
 * em quem, quem é transversal, o que acontece com dado torto — é testável sem
 * Prisma e sem sessão.
 */

export type NoOrganograma = {
  id: string;
  nome: string;
  tipo: TipoNo;
  /** Função que se repete no grupo (as 6 "Qualidade e Pós-venda"). */
  transversal: boolean;
  /**
   * VITRINE: `true` significa "você não tem acesso", não "isto é irrelevante".
   * O nó continua visível e legível — quem desenha põe cadeado, não remove.
   */
  locked: boolean;
  /** Para onde o nó leva. `null` = não há rota (ou o nó está travado). */
  rota: string | null;
  filhos: NoOrganograma[];
};

/** O mínimo que a montagem precisa saber de cada nó. */
export type NoDeclarado = {
  id: string;
  nome: string;
  tipo: TipoNo;
  parentId: string | null;
  transversal?: boolean;
};

export type OpcoesOrganograma = {
  /** Ids sem acesso. Vazio = nada travado. */
  travados?: ReadonlySet<string>;
  /** id → rota. Ausente = nó não navegável. */
  rotas?: ReadonlyMap<string, string>;
};

/**
 * Monta a floresta a partir da lista declarada.
 *
 * ── DECISÕES QUE O TESTE TRAVA ──────────────────────────────────────────
 *
 * ORDEM: a do array de entrada, dentro de cada pai. O catálogo já declara a
 * ordem em que o grupo se lê; reordenar por nome jogaria "Onix Agro" na frente
 * de "Onix Investimentos" sem que ninguém tenha decidido isso.
 *
 * PAI INEXISTENTE vira RAIZ, em vez de sumir. Um nó órfão na tela é um bug
 * visível; um nó que desaparece é um bug que ninguém nota — e o dado vem do
 * banco, que pode ter linha que o catálogo não conhece.
 *
 * CICLO não trava e não estoura pilha: os nós envolvidos entram como raízes,
 * sem filhos. `validarArvore` já recusa ciclo na escrita; aqui a régua é de
 * LEITURA, e leitura tem de sobreviver a dado torto.
 *
 * `locked` NÃO HERDA. Empresa travada com departamento liberado mostra o
 * departamento — o acesso é concedido por nó (`PessoaEmpresa`), e herdar aqui
 * inventaria uma restrição que o RBAC não fez.
 */
export function montarOrganograma(
  nos: readonly NoDeclarado[],
  opcoes: OpcoesOrganograma = {},
): NoOrganograma[] {
  const travados = opcoes.travados ?? new Set<string>();
  const rotas = opcoes.rotas ?? new Map<string, string>();

  const ids = new Set(nos.map((n) => n.id));
  const montados = new Map<string, NoOrganograma>();
  for (const n of nos) {
    const locked = travados.has(n.id);
    montados.set(n.id, {
      id: n.id,
      nome: n.nome,
      tipo: n.tipo,
      transversal: n.transversal === true,
      locked,
      // Nó travado não leva a lugar nenhum: o cadeado é o estado, e um link
      // que responde 403 é pior que a ausência dele.
      rota: locked ? null : (rotas.get(n.id) ?? null),
      filhos: [],
    });
  }

  const raizes: NoOrganograma[] = [];
  for (const n of nos) {
    const no = montados.get(n.id)!;
    const paiValido =
      n.parentId !== null && n.parentId !== n.id && ids.has(n.parentId) && !emCiclo(n.id, nos);
    if (paiValido) montados.get(n.parentId!)!.filhos.push(no);
    else raizes.push(no);
  }

  return raizes;
}

/** Sobe pelos pais até a raiz; `true` se voltar a passar pelo mesmo id. */
function emCiclo(id: string, nos: readonly NoDeclarado[]): boolean {
  const paiDe = new Map(nos.map((n) => [n.id, n.parentId]));
  const visitados = new Set<string>([id]);
  let atual = paiDe.get(id) ?? null;
  while (atual) {
    if (visitados.has(atual)) return true;
    visitados.add(atual);
    atual = paiDe.get(atual) ?? null;
  }
  return false;
}

/** Percorre a floresta inteira, em profundidade, na ordem de exibição. */
export function percorrer(raizes: readonly NoOrganograma[]): NoOrganograma[] {
  const out: NoOrganograma[] = [];
  const pilha = [...raizes].reverse();
  while (pilha.length) {
    const no = pilha.pop()!;
    out.push(no);
    for (let i = no.filhos.length - 1; i >= 0; i--) pilha.push(no.filhos[i]);
  }
  return out;
}

/** Quantos nós de cada papel. Serve ao teste e ao rodapé da tela. */
export function contarPorTipo(raizes: readonly NoOrganograma[]): Record<TipoNo, number> {
  const conta = { holding: 0, empresa: 0, departamento: 0 } as Record<TipoNo, number>;
  for (const no of percorrer(raizes)) conta[no.tipo] += 1;
  return conta;
}

/** Profundidade máxima da floresta (1 = só raízes). */
export function profundidade(raizes: readonly NoOrganograma[]): number {
  const nivel = (no: NoOrganograma): number =>
    no.filhos.length === 0 ? 1 : 1 + Math.max(...no.filhos.map(nivel));
  return raizes.length === 0 ? 0 : Math.max(...raizes.map(nivel));
}
