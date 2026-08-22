import assert from "node:assert/strict";
import { test } from "node:test";

import { ROTULO_ORIGEM, campoDe, resumirValor } from "./proveniencia.ts";

test("endereço do campo é estável e distingue os quatro escopos", () => {
  assert.equal(campoDe.cliente("perfilEmocional"), "perfilEmocional");
  assert.equal(campoDe.descoberta("medos"), "descoberta.medos");
  assert.equal(campoDe.meta("abc"), "meta:abc");
  assert.equal(campoDe.eventoVida("abc"), "eventoVida:abc");
});

test("meta e evento com o mesmo id não colidem", () => {
  assert.notEqual(campoDe.meta("x"), campoDe.eventoVida("x"));
});

test("resumo corta texto longo e marca o corte", () => {
  const r = resumirValor("a".repeat(500));
  assert.equal(r!.length, 160);
  assert.ok(r!.endsWith("…"));
});

test("valor vazio ou só espaço não vira resumo", () => {
  assert.equal(resumirValor(""), null);
  assert.equal(resumirValor("   "), null);
  assert.equal(resumirValor(null), null);
  assert.equal(resumirValor(undefined), null);
});

// O selo é lido por quem atende, não por quem programa: "ia" tem que dizer
// "Sugerido pela IA", nunca "ia".
test("toda origem tem rótulo em português", () => {
  for (const [chave, rotulo] of Object.entries(ROTULO_ORIGEM)) {
    assert.ok(rotulo.length > 3, `origem ${chave} sem rótulo legível`);
    assert.notEqual(rotulo, chave);
  }
});
