import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Trava o acoplamento entre `ACOES_DO_POST` e as ações que o POST aceita —
 * `src/app/api/empresas/hierarquia/route.ts`.
 *
 * ── POR QUE ESTE TESTE EXISTE ────────────────────────────────────────────
 * `ACOES_DO_POST` é o marcador de versão da rota: o GET a publica em
 * `acoesDisponiveis` para responder "o deploy novo subiu?" sem precisar
 * provocar um 400 no POST — ou seja, sem escrever para descobrir o que se pode
 * escrever.
 *
 * Um marcador de versão só vale se disser a verdade. Hoje a lista e o
 * `if (acao !== ...)` do POST são a MESMA decisão escrita duas vezes, e o que
 * as mantém em dia é um comentário pedindo que quem acrescentar ação num lugar
 * lembre do outro. A primeira ação nova esquecida faz o marcador mentir sobre
 * exatamente aquilo que ele existe para provar — e o modo de falha é
 * silencioso: a rota funciona, os testes passam, só a resposta do GET fica
 * errada. Quem confiar nela para validar um deploy conclui o oposto do real.
 *
 * ── POR QUE LER O FONTE, E NÃO IMPORTAR A ROTA ───────────────────────────
 * Importar `route.ts` traria `@/lib/prisma`, que constrói o PrismaClient no
 * import e exige `DATABASE_URL` — um teste puro passaria a depender de banco
 * para conferir duas listas de strings.
 *
 * E o acoplamento aqui é TEXTUAL por decisão declarada: o cabeçalho de
 * `ACOES_DO_POST` diz que não dá para derivar uma lista da outra sem tornar o
 * POST reflexivo, e prefere duas linhas vizinhas a uma indireção que ninguém
 * entenderia em seis meses. Este teste não desfaz essa escolha — ele põe a
 * rede embaixo dela. Trocar o `if` explícito por um `includes` na lista
 * resolveria por construção, mas é decisão de desenho de quem escreveu a rota,
 * não de quem escreve o teste.
 */

const ROTA = join(
  process.cwd(),
  "src",
  "app",
  "api",
  "empresas",
  "hierarquia",
  "route.ts",
);

const FONTE = readFileSync(ROTA, "utf8");

/** Strings entre aspas duplas de um trecho de código. */
function literais(trecho: string): string[] {
  return [...trecho.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * A lista que o GET publica, lida da declaração `const ACOES_DO_POST = [...]`.
 */
function acoesDeclaradas(): string[] {
  const m = FONTE.match(/const ACOES_DO_POST = \[([^\]]*)\] as const;/);
  assert.ok(
    m,
    "não achei `const ACOES_DO_POST = [...] as const;` em route.ts — se a " +
      "declaração mudou de forma, ajuste este teste JUNTO, nunca só o código: " +
      "um regex que parou de casar deixaria o teste verde sem conferir nada.",
  );
  return literais(m[1]);
}

/**
 * As ações que o POST de fato aceita, lidas da guarda
 * `if (acao !== undefined && acao !== "..." && ...)`.
 */
function acoesAceitasPeloPost(): { explicitas: string[]; aceitaAusencia: boolean } {
  const m = FONTE.match(/if \(acao !== undefined((?:\s*&&\s*acao !== "[^"]+")+)\)/);
  assert.ok(
    m,
    "não achei a guarda `if (acao !== undefined && acao !== \"...\")` no POST " +
      "de route.ts — se ela mudou de forma, ajuste este teste JUNTO.",
  );
  return { explicitas: literais(m[1]), aceitaAusencia: true };
}

/**
 * `padrao` não é um valor de `acao`: é a AUSÊNCIA do campo, que cria a raiz.
 * Aparece na lista publicada porque quem lê a resposta quer saber o que a rota
 * FAZ, não qual string digitar.
 */
const NOME_DA_AUSENCIA = "padrao";

// ── O acoplamento, nos dois sentidos ─────────────────────────────────────

test("toda ação aceita pelo POST está publicada em ACOES_DO_POST", () => {
  const publicadas = acoesDeclaradas();
  const { explicitas } = acoesAceitasPeloPost();

  const faltando = explicitas.filter((a) => !publicadas.includes(a));
  assert.deepEqual(
    faltando,
    [],
    `O POST aceita ${faltando.map((a) => `"${a}"`).join(", ")}, mas ACOES_DO_POST ` +
      "não publica. O GET está mentindo por OMISSÃO: quem conferir " +
      "`acoesDisponiveis` depois do deploy vai concluir que a ação nova não subiu. " +
      "Acrescente na constante, no topo de route.ts.",
  );
});

test("toda ação publicada em ACOES_DO_POST é aceita pelo POST", () => {
  const publicadas = acoesDeclaradas();
  const { explicitas } = acoesAceitasPeloPost();

  const sobrando = publicadas.filter(
    (a) => a !== NOME_DA_AUSENCIA && !explicitas.includes(a),
  );
  assert.deepEqual(
    sobrando,
    [],
    `ACOES_DO_POST publica ${sobrando.map((a) => `"${a}"`).join(", ")}, mas o POST ` +
      "responde 400 para essas. O GET está mentindo por EXCESSO, que é pior: " +
      "quem ler a resposta vai chamar uma ação que a rota recusa. " +
      "Remova da constante, ou acrescente na guarda do POST.",
  );
});

test("a lista publicada inclui o caso da ausência do campo", () => {
  // Sem isto, a resposta descreveria só duas das três coisas que a rota faz —
  // e a que ficaria de fora é justamente a que CRIA A RAIZ, que é o motivo de
  // a rota existir.
  const publicadas = acoesDeclaradas();
  assert.ok(
    publicadas.includes(NOME_DA_AUSENCIA),
    `ACOES_DO_POST precisa incluir "${NOME_DA_AUSENCIA}": o POST aceita a ausência ` +
      "de `acao` (guarda `acao !== undefined`) e isso cria a raiz.",
  );
  assert.equal(acoesAceitasPeloPost().aceitaAusencia, true);
});

// ── O terceiro elo: a lista chega mesmo na resposta do GET ───────────────

test("o GET publica ACOES_DO_POST em acoesDisponiveis", () => {
  // Os dois testes acima provam que a lista está certa. Este prova que ela é
  // SERVIDA: uma constante correta que ninguém serializa não é marcador de
  // versão nenhum, e o modo de falha (alguém troca por um literal solto no
  // NextResponse.json) some da revisão com facilidade.
  assert.match(
    FONTE,
    /acoesDisponiveis:\s*ACOES_DO_POST\b/,
    "o GET precisa devolver `acoesDisponiveis: ACOES_DO_POST` — servir um " +
      "literal solto no lugar reabre exatamente a divergência que este arquivo trava.",
  );
});

// ── Valores concretos, para a mudança aparecer no diff ───────────────────

test("as ações de hoje são padrao, seed-filhas e reparent", () => {
  // Snapshot deliberado. Os testes acima garantem COERÊNCIA entre os dois
  // lugares; este garante que uma ação nova (ou uma removida) não entre sem
  // que alguém encoste aqui de propósito — inclusive quando a mudança é
  // coerente nos dois lados.
  assert.deepEqual(acoesDeclaradas(), ["padrao", "seed-filhas", "reparent"]);
  assert.deepEqual(acoesAceitasPeloPost().explicitas.sort(), ["reparent", "seed-filhas"]);
});

// ── A âncora do próprio teste ────────────────────────────────────────────

test("o aviso que aponta para ACOES_DO_POST segue no switch do POST", () => {
  // Este teste pega o esquecimento; o comentário é o que evita o esquecimento.
  // Os dois se sustentam: sem o aviso, quem acrescenta ação descobre o
  // acoplamento pelo teste vermelho, sem saber o que a lista significa.
  assert.match(
    FONTE,
    /AO ACRESCENTAR UMA AÇÃO AQUI[\s\S]{0,400}ACOES_DO_POST/,
    "o aviso do switch do POST apontando para ACOES_DO_POST sumiu.",
  );
});
