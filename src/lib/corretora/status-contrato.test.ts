/**
 * Testes do catálogo de status — sem banco.
 *
 * O que importa aqui não é a lista em si; é que ela NÃO colapse estados que
 * respondem perguntas diferentes. Um `cancelado` que virasse `encerrado` no
 * import destruiria a taxa de churn de forma irreversível: depois de gravado,
 * ninguém reconstrói o motivo.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  STATUS_CONTRATO,
  ehStatusValido,
  exigirStatus,
  statusValidos,
  statusVigentes,
} from "./status-contrato.ts";

test("os seis status estão declarados", () => {
  assert.deepEqual(statusValidos(), [
    "em_analise",
    "recusado",
    "ativo",
    "suspenso",
    "cancelado",
    "encerrado",
  ]);
});

test("nenhum id repetido", () => {
  const ids = STATUS_CONTRATO.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("só `ativo` conta como vigente", () => {
  // `suspenso` é o que mais tenta entrar aqui por engano: o contrato existe,
  // mas NÃO há cobertura. Contá-lo como vigente inflaria a carteira ativa com
  // gente que está sem seguro.
  assert.deepEqual(statusVigentes(), ["ativo"]);
});

test("cancelado e encerrado são estados distintos", () => {
  // A distinção que o par ativo/inativo destruiria. Se um dia alguém unificar,
  // este teste é o que pergunta "e a taxa de churn?".
  assert.ok(ehStatusValido("cancelado"));
  assert.ok(ehStatusValido("encerrado"));
  const cancelado = STATUS_CONTRATO.find((s) => s.id === "cancelado");
  const encerrado = STATUS_CONTRATO.find((s) => s.id === "encerrado");
  assert.notEqual(cancelado?.descricao, encerrado?.descricao);
});

test("proposta que não virou contrato cabe na lista", () => {
  // Histórico completo inclui o que NÃO fechou — é o que mede conversão por
  // parceiro.
  assert.ok(ehStatusValido("em_analise"));
  assert.ok(ehStatusValido("recusado"));
});

test("ehStatusValido é exato e recusa o resto", () => {
  assert.equal(ehStatusValido("ativo"), true);
  assert.equal(ehStatusValido("Ativo"), false);
  assert.equal(ehStatusValido("inativo"), false);
  assert.equal(ehStatusValido(""), false);
});

test("exigirStatus devolve o válido e lança no inválido", () => {
  assert.equal(exigirStatus("suspenso"), "suspenso");
  assert.throws(() => exigirStatus("inativo"), /status inválido/);
  assert.throws(() => exigirStatus("inativo"), /em_analise, recusado, ativo/);
});
