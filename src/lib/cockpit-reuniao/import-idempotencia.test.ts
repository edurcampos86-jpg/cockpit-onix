import assert from "node:assert/strict";
import { test } from "node:test";

import { pendenciasTemConcluido, proximosPassosTemConcluido } from "./import-idempotencia.ts";

test("pendenciasTemConcluido — true se qualquer lado tem item concluído", () => {
  assert.equal(
    pendenciasTemConcluido({ assessor: [{ texto: "a", concluido: true }], cliente: [] }),
    true,
  );
  assert.equal(
    pendenciasTemConcluido({ assessor: [], cliente: [{ texto: "b", concluido: true }] }),
    true,
  );
});

test("pendenciasTemConcluido — false se nada concluído / vazio / lixo", () => {
  assert.equal(
    pendenciasTemConcluido({ assessor: [{ texto: "a", concluido: false }], cliente: [{ texto: "b", concluido: false }] }),
    false,
  );
  assert.equal(pendenciasTemConcluido({ assessor: [], cliente: [] }), false);
  assert.equal(pendenciasTemConcluido(null), false);
  assert.equal(pendenciasTemConcluido("lixo"), false);
});

test("proximosPassosTemConcluido — true só se algum item concluído", () => {
  assert.equal(proximosPassosTemConcluido([{ texto: "x", concluido: true }]), true);
  assert.equal(proximosPassosTemConcluido([{ texto: "x", concluido: false }]), false);
  assert.equal(proximosPassosTemConcluido([]), false);
  assert.equal(proximosPassosTemConcluido(null), false);
});
