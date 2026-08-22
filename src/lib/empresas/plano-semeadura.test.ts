import { test } from "node:test";
import assert from "node:assert/strict";
import { planejarSemeadura, descreverPlano } from "./plano-semeadura";
import type { EmpresaSemente, NoArvore } from "./seed-hierarquia";

const s = (
  id: string,
  nome: string,
  tipo: EmpresaSemente["tipo"],
  parentId: string | null,
  transversal = false,
): EmpresaSemente => ({ id, nome, tipo, parentId, transversal });

const n = (
  id: string,
  nome: string,
  tipo: NoArvore["tipo"],
  parentId: string | null,
  transversal = false,
): NoArvore => ({ id, nome, tipo, parentId, transversal });

const CATALOGO = [
  s("onix-co", "Onix Co", "holding", null),
  s("corretora", "Onix Corretora", "empresa", "onix-co"),
  s("corretora-qualidade", "Qualidade e Pós-venda", "departamento", "corretora", true),
];

test("banco vazio: tudo é criação", () => {
  const p = planejarSemeadura(CATALOGO, []);
  assert.deepEqual(p.criar.map((c) => c.id), ["onix-co", "corretora", "corretora-qualidade"]);
  assert.deepEqual(p.preservar, []);
  assert.equal(p.totalAntes, 0);
  assert.equal(p.totalDepois, 3);
});

test("linha que confere é preservada, não recriada", () => {
  const p = planejarSemeadura(CATALOGO, [n("onix-co", "Onix Co", "holding", null)]);
  assert.deepEqual(p.preservar, ["onix-co"]);
  assert.deepEqual(p.criar.map((c) => c.id), ["corretora", "corretora-qualidade"]);
  assert.deepEqual(p.divergencias, []);
});

test("nome divergente aparece — e NÃO vira criação nem conserto", () => {
  // O caso real: `imobiliaria` viveu meses como "Onix Imobiliária" enquanto o
  // catálogo dizia "Onix Imob". `skipDuplicates` ignora a linha inteira, então
  // o seed nunca acusou. É para isso que o plano existe.
  const p = planejarSemeadura(CATALOGO, [n("onix-co", "Onix Company", "holding", null)]);
  assert.deepEqual(p.criar.map((c) => c.id), ["corretora", "corretora-qualidade"]);
  assert.deepEqual(p.preservar, []);
  assert.deepEqual(p.divergencias, [
    { id: "onix-co", campo: "nome", noBanco: "Onix Company", noCatalogo: "Onix Co" },
  ]);
});

test("pai divergente é reportado — o seed nunca faz reparenting", () => {
  const p = planejarSemeadura(CATALOGO, [
    n("onix-co", "Onix Co", "holding", null),
    n("corretora", "Onix Corretora", "empresa", null), // devia pendurar na holding
  ]);
  assert.deepEqual(p.divergencias, [
    { id: "corretora", campo: "parentId", noBanco: "(null)", noCatalogo: "onix-co" },
  ]);
  assert.equal(p.criar.length, 1);
});

test("tipo e transversal também são conferidos", () => {
  const p = planejarSemeadura(CATALOGO, [
    n("corretora-qualidade", "Qualidade e Pós-venda", "empresa", "corretora", false),
  ]);
  assert.deepEqual(
    p.divergencias.map((d) => d.campo).sort(),
    ["tipo", "transversal"],
  );
});

test("linha que o catálogo não conhece é listada, não apagada", () => {
  const p = planejarSemeadura(CATALOGO, [n("legado", "Coisa Antiga", "empresa", null)]);
  assert.deepEqual(p.foraDoCatalogo, ["legado"]);
  assert.equal(p.totalAntes, 1);
  assert.equal(p.totalDepois, 4); // as 3 do catálogo entram; a legada fica
});

test("catálogo inteiro já no banco: nenhuma escrita", () => {
  const arvore = CATALOGO.map((c) => n(c.id, c.nome, c.tipo, c.parentId, c.transversal));
  const p = planejarSemeadura(CATALOGO, arvore);
  assert.deepEqual(p.criar, []);
  assert.equal(p.preservar.length, 3);
  assert.equal(p.totalAntes, p.totalDepois);
});

test("o relatório nomeia os quatro grupos, mesmo vazios", () => {
  const texto = descreverPlano(planejarSemeadura(CATALOGO, []));
  for (const t of ["CRIAR", "PRESERVAR", "DIVERGENTES", "FORA DO CATÁLOGO"]) {
    assert.equal(texto.includes(t), true, `faltou "${t}" no relatório`);
  }
});
