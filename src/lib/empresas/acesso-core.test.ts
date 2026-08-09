import assert from "node:assert/strict";
import { test } from "node:test";
import { descendentesDe, empresasVisiveis } from "./acesso-core";
import type { NoEmpresa } from "./hierarquia";

/** Árvore real do grupo: "onix-co" na raiz, as demais penduradas nela. */
const GRUPO: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: "onix-co" },
  { id: "corretora", parentId: "onix-co" },
  { id: "imobiliaria", parentId: "onix-co" },
  { id: "tech", parentId: "onix-co" },
];

test("descendentes da raiz são todas as filhas", () => {
  assert.deepEqual(
    [...descendentesDe("onix-co", GRUPO)].sort(),
    ["corretora", "imobiliaria", "investimentos", "tech"],
  );
});

test("folha não tem descendente", () => {
  assert.equal(descendentesDe("tech", GRUPO).size, 0);
});

test("a própria raiz não entra na lista de descendentes", () => {
  assert.ok(!descendentesDe("onix-co", GRUPO).has("onix-co"));
});

test("id inexistente devolve conjunto vazio, não explode", () => {
  assert.equal(descendentesDe("nao-existe", GRUPO).size, 0);
});

test("CICLO não trava a travessia", () => {
  // A→B→A. Uma travessia ingênua roda para sempre e derruba o processo.
  // `parentId` é dado editável: isso pode entrar por SQL manual.
  const ciclica: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "a" },
  ];
  const r = descendentesDe("a", ciclica);
  assert.deepEqual([...r].sort(), ["b", "c"]);
});

test("auto-referência é ignorada", () => {
  const auto: NoEmpresa[] = [{ id: "x", parentId: "x" }];
  assert.equal(descendentesDe("x", auto).size, 0);
});

test("funciona com mais de 2 níveis, se a régua de negócio mudar", () => {
  const tresNiveis: NoEmpresa[] = [
    { id: "raiz", parentId: null },
    { id: "meio", parentId: "raiz" },
    { id: "folha", parentId: "meio" },
  ];
  assert.deepEqual([...descendentesDe("raiz", tresNiveis)].sort(), ["folha", "meio"]);
});

/* ── empresasVisiveis ─────────────────────────────────────── */

test("sem concessão nenhuma => null (vê tudo) — é o estado do dia do deploy", () => {
  // A tabela nasce vazia. Se isto devolvesse conjunto vazio, TODO MUNDO
  // passaria a ver o grupo inteiro travado no primeiro deploy.
  assert.equal(empresasVisiveis([], GRUPO), null);
});

test("concessão na raiz com herança => vê raiz e todas as filhas", () => {
  const r = empresasVisiveis([{ empresaId: "onix-co", incluiDescendentes: true }], GRUPO);
  assert.deepEqual(
    [...(r as Set<string>)].sort(),
    ["corretora", "imobiliaria", "investimentos", "onix-co", "tech"],
  );
});

test("concessão na raiz SEM herança => vê só a raiz", () => {
  // É a diferença que a coluna `incluiDescendentes` existe para expressar: a
  // pergunta "acesso à holding dá acesso a tudo abaixo?" é de produto, e o
  // modelo suporta as duas respostas.
  const r = empresasVisiveis([{ empresaId: "onix-co", incluiDescendentes: false }], GRUPO);
  assert.deepEqual([...(r as Set<string>)], ["onix-co"]);
});

test("concessão em folha => só ela", () => {
  const r = empresasVisiveis([{ empresaId: "tech", incluiDescendentes: true }], GRUPO);
  assert.deepEqual([...(r as Set<string>)], ["tech"]);
});

test("concessões somam", () => {
  const r = empresasVisiveis(
    [
      { empresaId: "tech", incluiDescendentes: false },
      { empresaId: "corretora", incluiDescendentes: false },
    ],
    GRUPO,
  );
  assert.deepEqual([...(r as Set<string>)].sort(), ["corretora", "tech"]);
});

test("empresa repetida não duplica", () => {
  const r = empresasVisiveis(
    [
      { empresaId: "tech", incluiDescendentes: true },
      { empresaId: "tech", incluiDescendentes: false },
    ],
    GRUPO,
  );
  assert.equal((r as Set<string>).size, 1);
});

test("concessão órfã é ignorada, mas as válidas continuam valendo", () => {
  const r = empresasVisiveis(
    [
      { empresaId: "empresa-que-sumiu", incluiDescendentes: true },
      { empresaId: "tech", incluiDescendentes: false },
    ],
    GRUPO,
  );
  assert.deepEqual([...(r as Set<string>)], ["tech"]);
});

test("SÓ concessões órfãs => null, nunca conjunto vazio", () => {
  // Config incompleta não pode virar "não vê nada". Mesma regra do rbac.ts.
  const r = empresasVisiveis([{ empresaId: "fantasma", incluiDescendentes: true }], GRUPO);
  assert.equal(r, null);
});

test("árvore vazia com concessão => null", () => {
  assert.equal(empresasVisiveis([{ empresaId: "tech", incluiDescendentes: true }], []), null);
});

test("nunca devolve conjunto vazio, para nenhuma entrada", () => {
  // Invariante do subsistema: ou é null (vê tudo), ou tem ao menos uma empresa.
  const casos: Array<[{ empresaId: string; incluiDescendentes: boolean }[], NoEmpresa[]]> = [
    [[], GRUPO],
    [[{ empresaId: "x", incluiDescendentes: true }], GRUPO],
    [[{ empresaId: "tech", incluiDescendentes: true }], GRUPO],
    [[{ empresaId: "onix-co", incluiDescendentes: false }], GRUPO],
    [[{ empresaId: "tech", incluiDescendentes: true }], []],
  ];
  for (const [concessoes, arvore] of casos) {
    const r = empresasVisiveis(concessoes, arvore);
    assert.ok(r === null || r.size > 0, `conjunto vazio em ${JSON.stringify(concessoes)}`);
  }
});
