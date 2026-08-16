/**
 * Quem pode ler qual transcrição — módulo PURO (sem Prisma, sem sessão).
 *
 * ── O BURACO QUE ISTO FECHA ─────────────────────────────────────────────
 * `/api/meetings` não fazia NENHUMA checagem além da que o proxy já faz
 * ("existe sessão"). Qualquer pessoa logada — inclusive `role: "support"` —
 * lia a transcrição inteira de qualquer reunião: patrimônio declarado, assuntos
 * de família, o que o cliente falou sobre dinheiro.
 *
 * A ficha do mesmo cliente é gateada (`assertClienteVisivel`, camada 2 do
 * RBAC). A caixa de entrada dela não era. Cofre com fechadura na sala e a
 * papelada na mesa de fora.
 *
 * ── POR QUE O EIXO É O VENDEDOR, E NÃO O CGE ────────────────────────────
 * A ficha filtra por `assessorCge`, porque `ClienteBackoffice` TEM esse campo.
 * `Meeting` não tem cliente nenhum: liga em `Lead` (`zapier/webhook`) e só. A
 * única titularidade que o registro carrega é `vendedor` — que existe desde a
 * origem e é indexado (`@@index([vendedor, date])`), ou seja, o modelo já foi
 * desenhado com esse eixo.
 *
 * Então a régua aqui é: **você lê a reunião em que você estava**. Quem enxerga
 * tudo pelo RBAC (admin, escopo "todas", config incompleta) segue enxergando
 * tudo — a mesma postura não-disruptiva de `src/lib/rbac.ts`.
 *
 * ── ATENÇÃO: A FLAG ESTÁ LIGADA EM PRODUÇÃO ─────────────────────────────
 * O DEFAULT de `RBAC_ENFORCEMENT` no código é OFF, mas o valor gravado em
 * produção é `true` (medido em 16/08/2026). Este gate portanto VALE assim que
 * subir — ele não fica dormente esperando alguém ligar a flag. Na mesma
 * medição: 22 pessoas ativas, 1 com escopo restrito, e `Meeting` com ZERO
 * linhas — o buraco era real, o acervo exposto por ele era vazio.
 *
 * Quando a ponte reunião→cliente (#357) entrar, dá para somar um segundo eixo:
 * reunião cujo cliente casado está no seu escopo de CGE. Enquanto ela não
 * existir na `main`, prender o gate a ela seria adiar a correção do vazamento.
 */

/** Minúsculas, sem acento, sem pontuação, espaços colapsados. */
function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type EscopoReunioes =
  /** Enforcement OFF, admin, escopo "todas" ou config incompleta: vê tudo. */
  | { tipo: "tudo" }
  /** Restrito: só as reuniões em que a pessoa é o vendedor. */
  | { tipo: "so-minhas"; nomesDaPessoa: string[] };

/**
 * A reunião é desta pessoa?
 *
 * `vendedor` guarda o nome canônico do time ("Eduardo Campos"), montado por
 * `identificarVendedorDoPayload`. O cadastro da pessoa costuma trazer o nome
 * completo ("Eduardo Rodrigues Campos"), então igualdade exata falharia. A
 * régua é CONTENÇÃO DE TOKENS: todo pedaço do nome do vendedor tem de aparecer
 * no nome da pessoa.
 *
 *   "eduardo campos"  ⊆  {eduardo, rodrigues, campos}   → é dela
 *   "thiago vergal"   ⊄  {eduardo, rodrigues, campos}   → não é
 *
 * Sentido único de propósito: um vendedor de nome mais curto casa com a pessoa
 * de nome mais longo, nunca o contrário. Inverter deixaria "Eduardo" solto
 * casar com qualquer Eduardo do time.
 */
export function reuniaoEhDaPessoa(
  vendedor: string | null | undefined,
  nomesDaPessoa: string[],
): boolean {
  const v = normalizar(vendedor ?? "");
  if (!v) return false;

  const tokensVendedor = v.split(" ").filter(Boolean);
  if (tokensVendedor.length === 0) return false;

  return nomesDaPessoa.some((nome) => {
    const tokens = new Set(normalizar(nome).split(" ").filter(Boolean));
    if (tokens.size === 0) return false;
    return tokensVendedor.every((t) => tokens.has(t));
  });
}

/**
 * Filtra a lista para o que o escopo permite ler.
 *
 * `vendedor` vazio numa reunião NÃO é liberado para quem é restrito: sem dono
 * declarado não há como afirmar que a conversa é dela. Some da lista de quem
 * tem escopo restrito, continua visível para quem vê tudo — que é quem pode
 * arrumar o cadastro.
 */
export function filtrarReunioesPorEscopo<T extends { vendedor: string | null }>(
  reunioes: T[],
  escopo: EscopoReunioes,
): T[] {
  if (escopo.tipo === "tudo") return reunioes;
  return reunioes.filter((r) => reuniaoEhDaPessoa(r.vendedor, escopo.nomesDaPessoa));
}
