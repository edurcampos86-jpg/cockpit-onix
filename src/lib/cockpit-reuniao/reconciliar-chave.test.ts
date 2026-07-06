import assert from "node:assert/strict";
import { test } from "node:test";

import { campoFamilia, reconciliarChave } from "./reconciliar-chave.ts";

// ── 4 casos reais de drift (recon 07/07): cada um deve RECONCILIAR p/ a curta.
// kNovo = chave curta emitida no reimport; existente = chave longa já gravada.

test("real 1 — holding: holding-patrimonial → holding", () => {
  const d = reconciliarChave("projeto:holding", [{ campo: "projeto:holding-patrimonial" }]);
  assert.equal(d.acao, "reusar");
  assert.equal(d.campoCanonico, "projeto:holding");
  assert.equal(d.campoExistente, "projeto:holding-patrimonial");
});

test("real 2 — onco3: desinvestimento-onco3 → onco3", () => {
  const d = reconciliarChave("projeto:onco3", [{ campo: "projeto:desinvestimento-onco3" }]);
  assert.equal(d.acao, "reusar");
  assert.equal(d.campoCanonico, "projeto:onco3");
});

test("real 3 — seguro-vida: seguro-vida-inicio → seguro-vida", () => {
  const d = reconciliarChave("memoravel:seguro-vida", [{ campo: "memoravel:seguro-vida-inicio" }]);
  assert.equal(d.acao, "reusar");
  assert.equal(d.campoCanonico, "memoravel:seguro-vida");
});

test("real 4 — aposentadoria: plano-aposentadoria-idade → aposentadoria (cruza categoria)", () => {
  const d = reconciliarChave("projeto:aposentadoria", [
    { campo: "memoravel:plano-aposentadoria-idade" },
  ]);
  assert.equal(d.acao, "reusar");
  assert.equal(d.campoCanonico, "projeto:aposentadoria");
  assert.equal(d.campoExistente, "memoravel:plano-aposentadoria-idade");
});

// ── Negativo: conceitos distintos, interseção de núcleo vazia → NÃO fundir.
test("negativo — holding vs reforma-fazenda NÃO funde", () => {
  const d = reconciliarChave("projeto:holding", [{ campo: "projeto:reforma-fazenda" }]);
  assert.equal(d.acao, "criar");
  assert.equal(d.campoExistente, null);
});

// ── Empate: kNovo casa igualmente com 2 existentes (interseção 1 cada) → criar.
test("empate — 2 matches equidistantes → NÃO reconcilia (cria)", () => {
  const d = reconciliarChave("projeto:renda-imovel", [
    { campo: "projeto:renda-anual" }, // núcleo {renda}
    { campo: "projeto:imovel-geral" }, // núcleo {imovel}
  ]);
  assert.equal(d.acao, "criar");
  assert.ok(d.motivo.startsWith("empate"), `motivo=${d.motivo}`);
});

// ── FAMILIA: chave derivada do nome, independente da chave do LLM.
test("familia — dados.nome 'Ana Cristina' → familia:ana-cristina", () => {
  assert.equal(campoFamilia("Ana Cristina", "familia:conjuge-do-cliente"), "familia:ana-cristina");
  // Sem nome → cai no fallback (chave do LLM), como hoje.
  assert.equal(campoFamilia("", "familia:filho-1"), "familia:filho-1");
});

// ── 1b-2h: slug remove apelido em parênteses (senão gustavo-guga ≠ gustavo).
test("slug-hardening — 'Gustavo (Guga)' → familia:gustavo", () => {
  assert.equal(campoFamilia("Gustavo (Guga)", "familia:gustavo-guga"), "familia:gustavo");
  // Sanidade: nome simples inalterado.
  assert.equal(campoFamilia("Juliana", "familia:x"), "familia:juliana");
});

// ── 1b-2h: alias de sinônimo casa vocabulário disjunto (trabalho↔aposentadoria).
test("alias — plano-trabalho reconcilia com projeto:aposentadoria", () => {
  const d = reconciliarChave("memoravel:plano-trabalho", [{ campo: "projeto:aposentadoria" }]);
  assert.equal(d.acao, "reusar");
  assert.equal(d.campoCanonico, "projeto:aposentadoria");
});

// ── 1b-2h: alias é cirúrgico — token diferente (holding) não é afetado.
test("alias — não funde conceito não-relacionado", () => {
  const d = reconciliarChave("projeto:holding", [{ campo: "projeto:aposentadoria" }]);
  assert.equal(d.acao, "criar");
});
