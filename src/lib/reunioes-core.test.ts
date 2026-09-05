import assert from "node:assert/strict";
import { test } from "node:test";
import { escolherAgregadoComSlot, escolherCandidatoAgregado } from "./reunioes-core.ts";

const startAt = new Date("2026-09-03T10:00:00.000Z");

test("manual vence Google no mesmo startAt", () => {
  const vencedora = escolherCandidatoAgregado([
    { startAt, source: "google-cal", matchedVia: "email" },
    { startAt, source: "manual", matchedVia: "manual" },
  ]);
  assert.equal(vencedora?.source, "manual");
});

test("preserva prioridade das fontes externas", () => {
  const vencedora = escolherCandidatoAgregado([
    { startAt, source: "datacrazy-atividade", matchedVia: "telefone" },
    { startAt, source: "outlook-web", matchedVia: "email" },
    { startAt, source: "outlook-ics", matchedVia: "email" },
    { startAt, source: "google-cal", matchedVia: "nome-unico" },
  ]);
  assert.equal(vencedora?.source, "google-cal");
});

test("confirmação manual desempata linhas da mesma fonte", () => {
  const vencedora = escolherCandidatoAgregado([
    { startAt, source: "google-cal", matchedVia: "email" },
    { startAt, source: "google-cal", matchedVia: "manual" },
  ]);
  assert.equal(vencedora?.matchedVia, "manual");
});

test("lista vazia não inventa agregado", () => {
  assert.equal(escolherCandidatoAgregado([]), null);
});

test("slot manual sobrescreve Google mesmo quando Google seria mais recente", () => {
  const slot = {
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    source: "manual",
    matchedVia: "manual",
  };
  const googleMaisRecente = {
    startAt: new Date("2026-09-01T10:00:00.000Z"),
    source: "google-cal",
    matchedVia: "email",
  };
  assert.equal(escolherAgregadoComSlot(slot, googleMaisRecente), slot);
});

test("slot manual sobrescreve a próxima automática mais próxima", () => {
  const slot = {
    startAt: new Date("2026-12-01T10:00:00.000Z"),
    source: "manual",
    matchedVia: "manual",
  };
  const googleMaisProxima = {
    startAt: new Date("2026-10-01T10:00:00.000Z"),
    source: "google-cal",
    matchedVia: "email",
  };
  assert.equal(escolherAgregadoComSlot(slot, googleMaisProxima), slot);
});

test("ausência ou DELETE do slot revela o automático", () => {
  const google = { startAt, source: "google-cal", matchedVia: "email" };
  assert.equal(escolherAgregadoComSlot(null, google), google);
});
