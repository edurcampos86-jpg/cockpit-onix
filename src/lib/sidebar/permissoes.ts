/**
 * Quem vê qual item da sidebar — módulo PURO (sem Prisma, sem sessão, sem rede).
 *
 * ── POR QUE A REGRA MORA AQUI, E NÃO NA TELA ─────────────────────────────
 * `sidebar.tsx` tem 814 linhas, é `"use client"` e depende de `usePathname`.
 * Uma régua de acesso escrita lá dentro só poderia ser testada montando a
 * árvore inteira do React — que é o mesmo motivo pelo qual `ADMIN_ONLY_HREFS`
 * viveu anos sem um teste que dissesse o que ela protege.
 *
 * Aqui a régua é uma função de dois argumentos. O teste descreve a matriz
 * inteira, item por item, papel por papel.
 *
 * ── DUAS RÉGUAS, PORQUE SÃO DUAS PERGUNTAS DIFERENTES ────────────────────
 *   CARGO — "o que esta pessoa É no grupo" (`Pessoa.teamRole`). Não depende do
 *           organograma e vale igual em qualquer empresa.
 *   NÓ    — "onde esta pessoa TRABALHA" (`PessoaEmpresa`). Depende da árvore, e
 *           muda quando alguém concede acesso.
 *
 * Misturar as duas num campo só obrigaria a inventar um cargo para cada nó, ou
 * um nó para cada cargo. Elas convivem: um item exige uma OU outra.
 *
 * ── `nos: null` É "SEM RESTRIÇÃO", NÃO "NENHUM NÓ" ───────────────────────
 * É a mesma convenção de `empresasVisiveis` (`lib/empresas/acesso-core.ts`) e
 * de `resolverCgesVisiveis`, e é a parte que mais convida ao erro: quem não tem
 * NENHUMA concessão vê TUDO, porque restrição só começa para quem ganha uma
 * linha. Ler `null` como conjunto vazio esconderia Jurídico e Parceiros de
 * todo mundo — inclusive de quem concede.
 *
 * Em 23/08/2026 `PessoaEmpresa` tinha ZERO linhas em produção: hoje TODOS caem
 * neste caso, e a metade "por nó" desta régua não recorta nada. É o
 * comportamento correto do estado vazio, não filtro desligado.
 */

/** O que a tela sabe sobre quem está olhando. */
export type AcessoSidebar = {
  /** `isAdmin` COMPLETO: `User.role === "admin"` OU `Pessoa.teamRole === "admin"`. */
  ehAdmin: boolean;
  /** `Pessoa.teamRole === "lideranca"`. Em 23/08/2026: 1 pessoa em produção. */
  ehLideranca: boolean;
  /** Nós visíveis. `null` = SEM RESTRIÇÃO (vê todos) — ver bloco acima. */
  nos: ReadonlySet<string> | null;
};

/** A condição para um item aparecer. */
export type Regra =
  | { tipo: "todos" }
  | { tipo: "admin" }
  | { tipo: "admin-ou-lideranca" }
  /** Aparece para quem enxerga QUALQUER um destes nós. */
  | { tipo: "no"; nos: readonly string[] };

/* Os sete "Jurídico" do grupo: um em cada empresa mais o consolidador da
 * holding. Quem enxerga qualquer um deles opera assunto jurídico e vê os itens
 * jurídicos — não faz sentido exigir que seja o da holding. */
export const NOS_JURIDICO = [
  "onix-co-juridico",
  "corretora-juridico",
  "investimentos-juridico",
  "imobiliaria-juridico",
  "educacao-juridico",
  "contabil-juridico",
  "tech-juridico",
] as const;

/**
 * A matriz, por href. Item que NÃO está aqui é `todos` por omissão — a sidebar
 * tem dezenas de links e listar todos só para dizer "todos" seria uma lista que
 * envelhece a cada rota nova.
 *
 * O DEFAULT É PERMISSIVO de propósito, e é seguro porque este gate é
 * COSMÉTICO: cada página tem o próprio `redirect`. Esconder um link é
 * conveniência; o que impede o acesso é a página. Um default restritivo
 * esconderia silenciosamente toda rota nova até alguém lembrar de listá-la.
 */
export const REGRAS: Readonly<Record<string, Regra>> = {
  // ── CARGO: administração ──
  "/admin/auditoria/contratos": { tipo: "admin" },
  "/admin/backups": { tipo: "admin" },
  "/integracoes": { tipo: "admin" },
  "/configuracoes/flags": { tipo: "admin" },
  "/admin/juridico/email-ingest": { tipo: "admin" },
  // Já eram admin-only antes desta régua (ADMIN_ONLY_HREFS), e continuam.
  "/configuracoes/permissoes": { tipo: "admin" },
  "/empresas/corretora/importar": { tipo: "admin" },

  // ── CARGO: liderança ──
  "/time": { tipo: "admin-ou-lideranca" },
  "/time/insights": { tipo: "admin-ou-lideranca" },

  // ── NÓ ──
  "/juridico/contratos": { tipo: "no", nos: NOS_JURIDICO },
  "/admin/importacao/juridico": { tipo: "no", nos: NOS_JURIDICO },
  "/time/parceiros": { tipo: "no", nos: ["investimentos"] },

  // ── TODOS, declarados de propósito ──
  // Estão aqui para o teste poder afirmar que são abertos, em vez de dizer
  // isso por ausência.
  "/metodo": { tipo: "todos" },
  "/glossario": { tipo: "todos" },
  "/configuracoes/implementacoes": { tipo: "todos" },
};

/**
 * Nós que liberam o módulo "Mídias Sociais" (Painel, Calendário e o resto).
 *
 * Vive separado de `REGRAS` porque Mídias Sociais é um MÓDULO da sidebar (uma
 * seção que abre e fecha), não um href — a régua se aplica ao grupo inteiro.
 */
export const NOS_MIDIAS_SOCIAIS = ["onix-co-marketing"] as const;

/** A pessoa enxerga pelo menos um destes nós? `nos: null` ⇒ sim, sem restrição. */
export function enxergaAlgumNo(acesso: AcessoSidebar, nos: readonly string[]): boolean {
  if (acesso.nos === null) return true;
  return nos.some((id) => acesso.nos!.has(id));
}

/** Este href aparece na sidebar para esta pessoa? */
export function podeVerHref(href: string, acesso: AcessoSidebar): boolean {
  const regra = REGRAS[href];
  if (!regra) return true; // default permissivo — ver comentário de REGRAS

  switch (regra.tipo) {
    case "todos":
      return true;
    case "admin":
      return acesso.ehAdmin;
    case "admin-ou-lideranca":
      return acesso.ehAdmin || acesso.ehLideranca;
    case "no":
      // Admin não é recortado por nó: quem administra o grupo precisa alcançar
      // o grupo inteiro, e é ele quem concede os nós dos outros.
      return acesso.ehAdmin || enxergaAlgumNo(acesso, regra.nos);
  }
}

/** O módulo "Mídias Sociais" aparece? */
export function podeVerMidiasSociais(acesso: AcessoSidebar): boolean {
  return acesso.ehAdmin || enxergaAlgumNo(acesso, NOS_MIDIAS_SOCIAIS);
}

/**
 * Os hrefs do grupo ADMINISTRAÇÃO — os que exigem cargo de admin.
 *
 * Derivado de `REGRAS`, não escrito à mão: uma segunda lista divergiria da
 * primeira, e a que divergisse primeiro seria a que ninguém olha.
 */
export const HREFS_ADMINISTRACAO: readonly string[] = Object.entries(REGRAS)
  .filter(([, r]) => r.tipo === "admin")
  .map(([href]) => href);

/**
 * Separa uma lista de itens em GERAL e ADMINISTRAÇÃO, já filtrada.
 *
 * Devolver os dois grupos numa chamada só é o que permite a tela perguntar
 * "administração ficou vazia?" sem repetir o filtro — e o cabeçalho
 * ADMINISTRAÇÃO só existe quando há algo embaixo dele.
 */
export function separarGrupos<T extends { href: string }>(
  itens: readonly T[],
  acesso: AcessoSidebar,
): { geral: T[]; administracao: T[] } {
  const geral: T[] = [];
  const administracao: T[] = [];

  for (const item of itens) {
    if (!podeVerHref(item.href, acesso)) continue;
    if (HREFS_ADMINISTRACAO.includes(item.href)) administracao.push(item);
    else geral.push(item);
  }

  return { geral, administracao };
}
