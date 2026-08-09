import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PROFUNDIDADE_MAXIMA,
  ehRaiz,
  profundidadeDe,
  validarArvore,
  validarParent,
  type NoEmpresa,
} from "./hierarquia.ts";

/**
 * Árvore PLANA: todo mundo raiz solta.
 *
 * Era o estado que o seed deixava até a PR-B4 — de lá em diante as filhas
 * nascem penduradas, e esta forma passou a representar o BANCO ANTIGO ou o
 * banco que alguém desfez na mão. Continua sendo o fixture certo para exercitar
 * a régua: é sobre ele que `validarParent` responde "pode pendurar?", que é a
 * pergunta que o reparenting faz.
 */
const APOS_SEED: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: null },
  { id: "corretora", parentId: null },
  { id: "imobiliaria", parentId: null },
  { id: "corporate", parentId: null },
  { id: "tech", parentId: null },
];

/** Estado que a PR de reparenting vai produzir. */
const APOS_REPARENTING: NoEmpresa[] = [
  { id: "onix-co", parentId: null },
  { id: "investimentos", parentId: "onix-co" },
  { id: "corretora", parentId: "onix-co" },
];

// ── profundidadeDe ─────────────────────────────────────────────────────────

test("raiz é nível 1; filha de raiz é nível 2", () => {
  assert.equal(profundidadeDe("onix-co", APOS_REPARENTING), 1);
  assert.equal(profundidadeDe("investimentos", APOS_REPARENTING), 2);
});

test("empresa inexistente devolve null, não 0", () => {
  // 0 seria confundível com "raiz"; null diz "não sei responder".
  assert.equal(profundidadeDe("nao-existe", APOS_REPARENTING), null);
});

test("ciclo devolve null em vez de laço infinito", () => {
  const ciclo: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  assert.equal(profundidadeDe("a", ciclo), null);
  assert.equal(profundidadeDe("b", ciclo), null);
});

test("pai órfão (fora da lista) devolve null", () => {
  const orfao: NoEmpresa[] = [{ id: "a", parentId: "fantasma" }];
  assert.equal(profundidadeDe("a", orfao), null);
});

// ── ehRaiz ─────────────────────────────────────────────────────────────────

test("ehRaiz distingue pai null de pai preenchido", () => {
  assert.equal(ehRaiz({ id: "onix-co", parentId: null }), true);
  assert.equal(ehRaiz({ id: "investimentos", parentId: "onix-co" }), false);
});

// ── validarParent: o caminho feliz do reparenting ──────────────────────────

test("pendurar empresa do seed na raiz é válido", () => {
  const r = validarParent("investimentos", "onix-co", APOS_SEED);
  assert.equal(r.ok, true);
});

test("virar raiz (parent null) é sempre válido", () => {
  const r = validarParent("investimentos", null, APOS_REPARENTING);
  assert.equal(r.ok, true);
});

// ── validarParent: as recusas ──────────────────────────────────────────────

test("terceiro nível é recusado", () => {
  // "investimentos" já é filha de "onix-co"; pendurar algo nela criaria neto.
  const r = validarParent("corretora", "investimentos", APOS_REPARENTING);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "excede_profundidade");
});

test("auto-referência é recusada", () => {
  const r = validarParent("onix-co", "onix-co", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "auto_referencia");
});

test("pai inexistente é recusado", () => {
  const r = validarParent("investimentos", "fantasma", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "parent_inexistente");
});

test("nó inexistente é recusado", () => {
  const r = validarParent("fantasma", "onix-co", APOS_SEED);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "parent_inexistente");
});

test("dar pai a quem já tem filhas é recusado (empurraria as filhas p/ nível 3)", () => {
  // Caso simétrico ao "excede_profundidade": aqui quem estoura o teto não é o
  // nó movido, e sim a descendência dele. Precisa de um nó que JÁ tenha filha
  // e ainda seja raiz — "investimentos" em APOS_REPARENTING não serve, porque
  // lá ela é folha.
  const comFilha: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: null },
    { id: "sub-invest", parentId: "investimentos" },
  ];
  const r = validarParent("investimentos", "onix-co", comFilha);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.motivo, "no_tem_filhos");
});

test("repor o mesmo pai de um nó folha é válido (idempotente)", () => {
  // "investimentos" já é filha de "onix-co" e não tem filhas: revalidar o
  // vínculo existente não pode virar erro, senão um reparenting re-executado
  // falharia na segunda passada.
  const r = validarParent("investimentos", "onix-co", APOS_REPARENTING);
  assert.equal(r.ok, true);
});

// ── validarArvore: auditoria do estado inteiro ─────────────────────────────

test("estado logo após o seed da PR-A é sadio", () => {
  // 8 raízes soltas é estado VÁLIDO: o reparenting é PR seguinte.
  assert.deepEqual(validarArvore(APOS_SEED), []);
});

test("estado após reparenting é sadio", () => {
  assert.deepEqual(validarArvore(APOS_REPARENTING), []);
});

test("árvore vazia é sadia", () => {
  assert.deepEqual(validarArvore([]), []);
});

test("neto entrado por SQL manual é detectado na auditoria", () => {
  const comNeto: NoEmpresa[] = [
    { id: "onix-co", parentId: null },
    { id: "investimentos", parentId: "onix-co" },
    { id: "sub", parentId: "investimentos" },
  ];
  const problemas = validarArvore(comNeto);
  assert.equal(problemas.length, 1);
  assert.equal(problemas[0].id, "sub");
  assert.equal(problemas[0].motivo, "excede_profundidade");
});

test("ciclo entrado por SQL manual é detectado, sem travar", () => {
  const ciclo: NoEmpresa[] = [
    { id: "a", parentId: "b" },
    { id: "b", parentId: "a" },
  ];
  const problemas = validarArvore(ciclo);
  assert.equal(problemas.length, 2);
  assert.equal(problemas.every((p) => p.motivo === "ciclo"), true);
});

test("o teto declarado é 2", () => {
  assert.equal(PROFUNDIDADE_MAXIMA, 2);
});
