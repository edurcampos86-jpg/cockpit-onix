import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizarTelefoneZapi } from "./telefone.ts";

// ── O caso que motivou a função: o formato que a UI de /time SUGERE
// (placeholder "(71) 99999-9999") não era o que a Z-API aceita.

test("formato do placeholder de /time vira dígitos com DDI", () => {
  assert.equal(normalizarTelefoneZapi("(71) 99735-9025"), "5571997359025");
});

test("formato de contato do celular também", () => {
  assert.equal(normalizarTelefoneZapi("+55 71 99645-0047"), "5571996450047");
});

test("já normalizado passa intacto (idempotente)", () => {
  assert.equal(normalizarTelefoneZapi("5571997359025"), "5571997359025");
  assert.equal(
    normalizarTelefoneZapi(normalizarTelefoneZapi("(71) 99735-9025")),
    "5571997359025",
  );
});

// ── Variações de digitação.

test("espaços, pontos e traços são removidos", () => {
  assert.equal(normalizarTelefoneZapi(" 71 9 9735 . 9025 "), "5571997359025");
});

test("fixo com 10 dígitos ganha DDI", () => {
  assert.equal(normalizarTelefoneZapi("(71) 3333-4444"), "557133334444");
});

// ── Conservador: não inventa DDI para tamanho inesperado.

test("número internacional já com DDI não é alterado", () => {
  // 12 dígitos, não-brasileiro — prefixar 55 criaria um número errado.
  assert.equal(normalizarTelefoneZapi("351912345678"), "351912345678");
});

test("entrada curta demais não vira número plausível", () => {
  assert.equal(normalizarTelefoneZapi("99735"), "99735");
});

// ── Ausência.

test("vazio, nulo e só pontuação devolvem string vazia", () => {
  for (const v of ["", "   ", "()- ", null, undefined]) {
    assert.equal(normalizarTelefoneZapi(v), "", `entrada=${JSON.stringify(v)}`);
  }
});
