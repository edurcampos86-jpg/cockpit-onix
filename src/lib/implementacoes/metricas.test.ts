import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcularMetricasBacklog,
  medianaDias,
  type LinhaMetrica,
} from "./metricas";

function linha(p: Partial<LinhaMetrica> = {}): LinhaMetrica {
  return {
    createdAt: new Date("2026-01-01T00:00:00Z"),
    prNumero: null,
    prStatus: null,
    prMergedAt: null,
    ...p,
  };
}

/** Sugestão criada em 01/01 e mergeada `dias` depois. */
function entregue(dias: number, numero = 1): LinhaMetrica {
  return linha({
    prNumero: numero,
    prStatus: "merged",
    prMergedAt: new Date(Date.UTC(2026, 0, 1 + dias)),
  });
}

test("fila vazia não divide por zero", () => {
  const m = calcularMetricasBacklog([]);
  assert.deepEqual(m, {
    total: 0,
    comPr: 0,
    entregues: 0,
    leadTimeMedianoDias: null,
    taxaEntrega: 0,
  });
});

test("conta fila, vínculos e entregas separadamente", () => {
  const m = calcularMetricasBacklog([
    linha(), // sem PR
    linha({ prNumero: 10, prStatus: "aberta" }), // vinculada, não entregue
    entregue(5, 11),
  ]);
  assert.equal(m.total, 3);
  assert.equal(m.comPr, 2);
  assert.equal(m.entregues, 1);
});

test("entrega é medida por prMergedAt, não por prStatus", () => {
  // Status é digitado à mão e pode estar adiantado; a data é do servidor.
  const otimista = linha({ prNumero: 7, prStatus: "merged", prMergedAt: null });
  const m = calcularMetricasBacklog([otimista]);
  assert.equal(m.entregues, 0);
  assert.equal(m.leadTimeMedianoDias, null);
});

test("lead time em dias, mediana com número ímpar de entregas", () => {
  const m = calcularMetricasBacklog([entregue(1), entregue(10), entregue(4)]);
  assert.equal(m.leadTimeMedianoDias, 4);
});

test("mediana com número par é a média dos dois do meio", () => {
  const m = calcularMetricasBacklog([entregue(2), entregue(4), entregue(6), entregue(8)]);
  assert.equal(m.leadTimeMedianoDias, 5);
});

test("mediana ignora o outlier que a média não ignoraria", () => {
  // Média seria ~61 dias; nenhuma entrega real levou isso.
  const m = calcularMetricasBacklog([entregue(1), entregue(2), entregue(240)]);
  assert.equal(m.leadTimeMedianoDias, 2);
});

test("merge anterior à criação é descartado, não vira lead time negativo", () => {
  const corrompida = linha({
    createdAt: new Date("2026-03-01T00:00:00Z"),
    prNumero: 9,
    prStatus: "merged",
    prMergedAt: new Date("2026-02-01T00:00:00Z"),
  });
  const m = calcularMetricasBacklog([corrompida, entregue(6)]);
  assert.equal(m.leadTimeMedianoDias, 6);
});

test("taxa de entrega é percentual arredondado da fila inteira", () => {
  const m = calcularMetricasBacklog([entregue(1), linha(), linha()]);
  assert.equal(m.taxaEntrega, 33);
});

test("lead time do mesmo dia é 0, não null", () => {
  const m = calcularMetricasBacklog([entregue(0)]);
  assert.equal(m.leadTimeMedianoDias, 0);
  assert.equal(m.entregues, 1);
});

test("medianaDias de lista vazia é null", () => {
  assert.equal(medianaDias([]), null);
});

test("medianaDias arredonda para 1 casa", () => {
  assert.equal(medianaDias([1, 2]), 1.5);
  assert.equal(medianaDias([1, 1.26]), 1.1);
});
