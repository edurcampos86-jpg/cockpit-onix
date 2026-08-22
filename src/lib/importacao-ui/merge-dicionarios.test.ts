/**
 * O teste que justifica o módulo é "ensinar não desaprende": um spread raso
 * passa em quase tudo aqui e falha exatamente nele.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { mesclarDicionarios, tamanhoDoVocabulario } from "./merge-dicionarios.ts";

const ATUAL = {
  tipoProduto: { "SEGURO DE VIDA": "vida", "PREV PRIVADA": "previdencia" },
  status: { ATIVO: "ativo", CANCELADO: "cancelado" },
};

test("ensinar uma palavra nova não desaprende as antigas", () => {
  const r = mesclarDicionarios(ATUAL, { tipoProduto: { "SEG VIDA IND": "vida" } });
  assert.deepEqual(r.dicionarios.tipoProduto, {
    "SEGURO DE VIDA": "vida",
    "PREV PRIVADA": "previdencia",
    "SEG VIDA IND": "vida",
  });
  assert.deepEqual(r.dicionarios.status, ATUAL.status);
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 5);
  assert.deepEqual(r.adicionados, [
    { campo: "tipoProduto", rotulo: "SEG VIDA IND", valor: "vida" },
  ]);
  assert.deepEqual(r.redefinidos, []);
});

test("campo novo entra sem tocar nos que existiam", () => {
  const r = mesclarDicionarios(ATUAL, { parceiro: { "PORTO SEG": "Porto Seguro" } });
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 5);
  assert.deepEqual(r.dicionarios.parceiro, { "PORTO SEG": "Porto Seguro" });
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
  assert.deepEqual(r.dicionarios, ATUAL);
  assert.equal(tamanhoDoVocabulario(r.dicionarios), 4);
});
