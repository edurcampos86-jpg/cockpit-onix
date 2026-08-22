/**
 * O teste que justifica o módulo é "ensinar não desaprende": um spread raso
 * passa em quase tudo aqui e falha exatamente nele.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { mesclarDicionarios, tamanhoDoVocabulario } from "./merge-dicionarios.ts";

/**
 * As tabelas do resultado são `Object.create(null)` — sem protótipo, de
 * propósito. `deepEqual` compara protótipo, então comparar direto acusaria
 * diferença onde não há. Isto normaliza para objeto comum antes de comparar.
 */
function planificar(d: Record<string, Record<string, string>>): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { ...v }]));
}

const ATUAL = {
  tipoProduto: { "SEGURO DE VIDA": "vida", "PREV PRIVADA": "previdencia" },
  status: { ATIVO: "ativo", CANCELADO: "cancelado" },
};

test("ensinar uma palavra nova não desaprende as antigas", () => {
  const r = mesclarDicionarios(ATUAL, { tipoProduto: { "SEG VIDA IND": "vida" } });
  assert.deepEqual(planificar(r.dicionarios).tipoProduto, {
    "SEGURO DE VIDA": "vida",
    "PREV PRIVADA": "previdencia",
    "SEG VIDA IND": "vida",
  });
  assert.deepEqual(planificar(r.dicionarios).status, ATUAL.status);
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 5);
  assert.deepEqual(r.adicionados, [
    { campo: "tipoProduto", rotulo: "SEG VIDA IND", valor: "vida" },
  ]);
  assert.deepEqual(r.redefinidos, []);
});

test("campo novo entra sem tocar nos que existiam", () => {
  const r = mesclarDicionarios(ATUAL, { parceiro: { "PORTO SEG": "Porto Seguro" } });
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 5);
  assert.deepEqual(planificar(r.dicionarios).parceiro, { "PORTO SEG": "Porto Seguro" });
});

test("redefinir um rótulo é registrado, não silencioso", () => {
  const r = mesclarDicionarios(ATUAL, { status: { ATIVO: "vigente" } });
  assert.deepEqual(r.redefinidos, [
    { campo: "status", rotulo: "ATIVO", de: "ativo", para: "vigente" },
  ]);
  assert.deepEqual(r.adicionados, []);
  assert.equal(r.dicionarios.status.ATIVO, "vigente");
});

test("reensinar a mesma tradução não conta como mudança", () => {
  const r = mesclarDicionarios(ATUAL, { status: { ATIVO: "ativo" } });
  assert.deepEqual(r.adicionados, []);
  assert.deepEqual(r.redefinidos, []);
});

test("rótulo sem valor é descartado — pendente é melhor que traduzido para nada", () => {
  const r = mesclarDicionarios(ATUAL, {
    tipoProduto: { "RESIDENCIAL": "  ", "": "vida", "AUTO": "auto" },
  });
  assert.deepEqual(r.descartados, [
    { campo: "tipoProduto", rotulo: "RESIDENCIAL" },
    { campo: "tipoProduto", rotulo: "" },
  ]);
  assert.deepEqual(r.adicionados, [
    { campo: "tipoProduto", rotulo: "AUTO", valor: "auto" },
  ]);
  assert.ok(!("RESIDENCIAL" in r.dicionarios.tipoProduto));
  assert.ok(!("" in r.dicionarios.tipoProduto));
});

test("espaço em volta não cria duas entradas para a mesma palavra", () => {
  const r = mesclarDicionarios(ATUAL, { status: { "  ATIVO ": " vigente " } });
  assert.equal(Object.keys(r.dicionarios.status).length, 2);
  assert.equal(r.dicionarios.status.ATIVO, "vigente");
});

test("não muta o dicionário recebido", () => {
  const congelado = { status: { ATIVO: "ativo" } };
  const r = mesclarDicionarios(congelado, { status: { NOVO: "novo" } });
  assert.deepEqual(congelado, { status: { ATIVO: "ativo" } });
  assert.equal(Object.keys(r.dicionarios.status).length, 2);
});

test("aprendizado vazio devolve o mesmo vocabulário", () => {
  const r = mesclarDicionarios(ATUAL, {});
  assert.deepEqual(planificar(r.dicionarios), ATUAL);
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 4);
});

test("campo com nome perigoso é recusado, não sumido em silêncio", () => {
  // Com objeto literal, `resultado["__proto__"] = {...}` não cria propriedade
  // própria: o campo desapareceria do resultado sem entrar em nenhuma lista.
  const sujo = JSON.parse('{"__proto__":{"X":"y"},"status":{"ATIVO":"ativo"}}');
  const r = mesclarDicionarios(sujo, {});
  assert.deepEqual(Object.keys(r.dicionarios), ["status"]);
  assert.deepEqual(r.camposRecusados, ["__proto__"]);
});

test("aprender em campo `constructor` não escreve no Object global", () => {
  const r = mesclarDicionarios({}, { constructor: { X: "y" } });
  assert.deepEqual(r.camposRecusados, ["constructor"]);
  assert.equal((Object as unknown as Record<string, unknown>).X, undefined);
});

test("rótulo `__proto__` não polui Object.prototype", () => {
  const aprendizado = JSON.parse('{"status":{"__proto__":"sim","NOVO":"novo"}}');
  const r = mesclarDicionarios({}, aprendizado);
  assert.equal((({}) as Record<string, unknown>).POLUIDO, undefined);
  assert.deepEqual(r.descartados, [{ campo: "status", rotulo: "__proto__" }]);
  assert.deepEqual(r.adicionados, [{ campo: "status", rotulo: "NOVO", valor: "novo" }]);
  assert.deepEqual(Object.keys(r.dicionarios.status), ["NOVO"]);
});

test("o que é reportado em adicionados está mesmo no dicionário", () => {
  // A pior falha do merge não é perder dado: é reportar que aprendeu algo que
  // não está lá. Este teste amarra as duas metades.
  const r = mesclarDicionarios(ATUAL, {
    tipoProduto: { AUTO: "auto", VAZIO: "" },
    status: { PENDENTE: "ativo" },
  });
  for (const a of r.adicionados) {
    assert.equal(r.dicionarios[a.campo][a.rotulo], a.valor);
  }
  for (const d of r.descartados) {
    assert.ok(!(d.rotulo in (r.dicionarios[d.campo] ?? {})));
  }
});
