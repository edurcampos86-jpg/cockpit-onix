import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ascender,
  descendentes,
  ArvoreParceirosInvalida,
  PROFUNDIDADE_MAXIMA_PARCEIROS,
  type NoParceiro,
} from "./parceiro-core";

/**
 * Rede de exemplo:
 *
 *   raiz
 *   ├── a
 *   │   ├── a1
 *   │   └── a2
 *   └── b
 *
 *   solo (raiz própria, sem ninguém abaixo)
 */
const REDE: NoParceiro[] = [
  { id: "raiz", indicadoPorParceiroId: null },
  { id: "a", indicadoPorParceiroId: "raiz" },
  { id: "b", indicadoPorParceiroId: "raiz" },
  { id: "a1", indicadoPorParceiroId: "a" },
  { id: "a2", indicadoPorParceiroId: "a" },
  { id: "solo", indicadoPorParceiroId: null },
];

// ── ascender: para quem a comissão sobe ──────────────────────────────────

test("ascender de uma folha chega na raiz", () => {
  assert.equal(ascender("a1", REDE)?.id, "raiz");
});

test("ascender de um nó intermediário chega na raiz", () => {
  assert.equal(ascender("a", REDE)?.id, "raiz");
});

test("raiz é raiz de si mesma — quem chama não trata caso especial", () => {
  assert.equal(ascender("raiz", REDE)?.id, "raiz");
  assert.equal(ascender("solo", REDE)?.id, "solo");
});

test("id inexistente devolve null em vez de apontar comissão para o parceiro errado", () => {
  assert.equal(ascender("nao-existe", REDE), null);
});

test("pai apontado mas ausente da lista devolve a raiz VISÍVEL", () => {
  // Recorte parcial da árvore (consulta por escopo, por exemplo): a cadeia
  // termina onde a informação termina.
  const recorte: NoParceiro[] = [{ id: "x", indicadoPorParceiroId: "fora-do-recorte" }];
  assert.equal(ascender("x", recorte)?.id, "x");
});

// ── descendentes: a subárvore que soma AUM de rede ───────────────────────

test("descendentes da raiz são a rede inteira abaixo dela", () => {
  assert.deepEqual([...descendentes("raiz", REDE)].sort(), ["a", "a1", "a2", "b"]);
});

test("descendentes de um nó intermediário são só a subárvore dele", () => {
  assert.deepEqual([...descendentes("a", REDE)].sort(), ["a1", "a2"]);
});

test("folha não tem descendente", () => {
  assert.equal(descendentes("a1", REDE).size, 0);
});

test("o próprio nó não entra na própria subárvore", () => {
  assert.ok(!descendentes("raiz", REDE).has("raiz"));
});

test("id inexistente devolve conjunto vazio, não explode", () => {
  assert.equal(descendentes("nao-existe", REDE).size, 0);
});

test("raiz irmã não vaza para a subárvore da outra", () => {
  assert.ok(!descendentes("raiz", REDE).has("solo"));
});

// ── À prova de ciclo, MESMO com o trigger do banco no lugar ──────────────
// O trigger (20260811092601) impede que um ciclo ENTRE. Estas funções também
// rodam sobre dado que nunca passou pelo banco — fixture, import, planilha — e
// sobre bancos restaurados de antes do trigger existir.

test("ciclo A→B→A: descendentes termina em vez de rodar para sempre", () => {
  const ciclo: NoParceiro[] = [
    { id: "a", indicadoPorParceiroId: "b" },
    { id: "b", indicadoPorParceiroId: "a" },
  ];
  assert.deepEqual([...descendentes("a", ciclo)], ["b"]);
});

test("ciclo longo A→B→C→A: descendentes termina", () => {
  const ciclo: NoParceiro[] = [
    { id: "a", indicadoPorParceiroId: "c" },
    { id: "b", indicadoPorParceiroId: "a" },
    { id: "c", indicadoPorParceiroId: "b" },
  ];
  assert.deepEqual([...descendentes("a", ciclo)].sort(), ["b", "c"]);
});

test("auto-referência não vira aresta", () => {
  const auto: NoParceiro[] = [{ id: "x", indicadoPorParceiroId: "x" }];
  assert.equal(descendentes("x", auto).size, 0);
});

test("ascender num ciclo LANÇA em vez de devolver raiz inventada", () => {
  const ciclo: NoParceiro[] = [
    { id: "a", indicadoPorParceiroId: "b" },
    { id: "b", indicadoPorParceiroId: "a" },
  ];
  assert.throws(() => ascender("a", ciclo), ArvoreParceirosInvalida);
});

test("ascender numa auto-referência LANÇA", () => {
  const auto: NoParceiro[] = [{ id: "x", indicadoPorParceiroId: "x" }];
  assert.throws(() => ascender("x", auto), ArvoreParceirosInvalida);
});

test("diamante (dois caminhos até o mesmo nó) não duplica nem trava", () => {
  const diamante: NoParceiro[] = [
    { id: "topo", indicadoPorParceiroId: null },
    { id: "esq", indicadoPorParceiroId: "topo" },
    { id: "dir", indicadoPorParceiroId: "topo" },
    { id: "fundo", indicadoPorParceiroId: "esq" },
  ];
  assert.deepEqual([...descendentes("topo", diamante)].sort(), ["dir", "esq", "fundo"]);
});

// ── O teto de profundidade, exercitado de verdade ────────────────────────
// Estes testes existem para que o teto não seja um número que ninguém nunca
// tocou. Se alguém mudar PROFUNDIDADE_MAXIMA_PARCEIROS, eles acusam.

/** Cadeia em linha reta com `n` nós: n0 ← n1 ← … ← n(n-1). */
function cadeia(n: number): NoParceiro[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    indicadoPorParceiroId: i === 0 ? null : `n${i - 1}`,
  }));
}

test("o teto é uma constante própria deste módulo, não herdada de Empresa", () => {
  // Empresa tem PROFUNDIDADE_MAXIMA = 2 (regra de negócio decretada). Aqui o
  // número é limite de segurança e a profundidade de negócio é ilimitada — se
  // estes dois valores empatarem, é sinal de que alguém copiou o teto errado.
  assert.equal(PROFUNDIDADE_MAXIMA_PARCEIROS, 64);
  assert.ok(PROFUNDIDADE_MAXIMA_PARCEIROS > 2);
});

test("ascender sobe uma cadeia no limite exato do teto", () => {
  // Teto de saltos = PROFUNDIDADE_MAXIMA_PARCEIROS, então uma cadeia com
  // teto+1 nós exige exatamente teto saltos da folha até a raiz.
  const arvore = cadeia(PROFUNDIDADE_MAXIMA_PARCEIROS + 1);
  const folha = `n${PROFUNDIDADE_MAXIMA_PARCEIROS}`;
  assert.equal(ascender(folha, arvore)?.id, "n0");
});

test("ascender LANÇA um salto além do teto", () => {
  const arvore = cadeia(PROFUNDIDADE_MAXIMA_PARCEIROS + 2);
  const folha = `n${PROFUNDIDADE_MAXIMA_PARCEIROS + 1}`;
  assert.throws(() => ascender(folha, arvore), ArvoreParceirosInvalida);
});

test("descendentes percorre uma cadeia no limite do teto", () => {
  const arvore = cadeia(PROFUNDIDADE_MAXIMA_PARCEIROS);
  assert.equal(descendentes("n0", arvore).size, PROFUNDIDADE_MAXIMA_PARCEIROS - 1);
});

test("descendentes LANÇA quando a cadeia passa do teto", () => {
  const arvore = cadeia(PROFUNDIDADE_MAXIMA_PARCEIROS + 5);
  assert.throws(() => descendentes("n0", arvore), ArvoreParceirosInvalida);
});

test("árvore LARGA e rasa não esbarra no teto — ele conta nível, não nós", () => {
  // 500 filhos diretos de uma raiz: 1 nível. Se o teto contasse nós, isto
  // falharia e a régua estaria medindo a coisa errada.
  const larga: NoParceiro[] = [
    { id: "raiz", indicadoPorParceiroId: null },
    ...Array.from({ length: 500 }, (_, i) => ({
      id: `f${i}`,
      indicadoPorParceiroId: "raiz",
    })),
  ];
  assert.equal(descendentes("raiz", larga).size, 500);
});

// ── Casos de borda de entrada ────────────────────────────────────────────

test("lista vazia não explode em nenhuma das duas funções", () => {
  assert.equal(ascender("x", []), null);
  assert.equal(descendentes("x", []).size, 0);
});

test("id duplicado na lista não duplica a subárvore", () => {
  const dup: NoParceiro[] = [
    { id: "raiz", indicadoPorParceiroId: null },
    { id: "a", indicadoPorParceiroId: "raiz" },
    { id: "a", indicadoPorParceiroId: "raiz" },
  ];
  assert.deepEqual([...descendentes("raiz", dup)], ["a"]);
});
