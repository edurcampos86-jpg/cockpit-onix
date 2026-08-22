import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAMPOS_DESCOBERTA,
  CAMPOS_DESTINO,
  destinoValido,
  rotuloDe,
  statusValido,
  valorEfetivo,
} from "./sugestoes.ts";

// ── Allowlist: a razão de existir é impedir que a extração escreva em coluna
// que ninguém autorizou. Um destino inventado pelo LLM tem que ser recusado.

test("destino fora do catálogo é recusado", () => {
  assert.equal(destinoValido("saldo", "valor"), false);
  assert.equal(destinoValido("cliente", "receitaAnual"), false);
  assert.equal(destinoValido("descoberta", "cpfCnpj"), false);
});

test("destino do catálogo é aceito", () => {
  assert.equal(destinoValido("descoberta", "medos"), true);
  assert.equal(destinoValido("perfilEmocional", "perfilEmocional"), true);
});

test("par com destino certo e campo errado é recusado", () => {
  assert.equal(destinoValido("meta", "medos"), false);
});

test("todo campo do catálogo tem rótulo em português", () => {
  for (const c of CAMPOS_DESTINO) {
    assert.ok(c.rotulo.length > 2, `${c.destino}.${c.campo} sem rótulo`);
    assert.notEqual(c.rotulo, c.campo);
  }
});

test("rótulo de par inexistente é null, não string vazia", () => {
  assert.equal(rotuloDe("saldo", "x"), null);
});

test("os nove campos de PerfilDescoberta estão no catálogo", () => {
  assert.equal(CAMPOS_DESCOBERTA.length, 9);
  assert.ok(CAMPOS_DESCOBERTA.includes("perguntaMagica"));
});

// ── valorEfetivo: o caso que importa é o revisor ter corrigido o texto.

test("edição vence o valor sugerido", () => {
  assert.equal(valorEfetivo({ valorSugerido: "do LLM", valorEditado: "corrigido" }), "corrigido");
});

test("sem edição, vale o sugerido", () => {
  assert.equal(valorEfetivo({ valorSugerido: "do LLM", valorEditado: null }), "do LLM");
  assert.equal(valorEfetivo({ valorSugerido: "do LLM" }), "do LLM");
});

test("edição só com espaço não conta como edição", () => {
  assert.equal(valorEfetivo({ valorSugerido: "do LLM", valorEditado: "   " }), "do LLM");
});

test('não existe status "editada"', () => {
  assert.equal(statusValido("editada"), false);
  assert.equal(statusValido("aceita"), true);
  assert.equal(statusValido("pendente"), true);
  assert.equal(statusValido("descartada"), true);
});
