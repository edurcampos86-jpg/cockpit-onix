import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrEntrada } from "./parse-pr";

test("aceita número puro", () => {
  assert.deepEqual(parsePrEntrada("123"), { numero: 123, url: null });
});

test("aceita número com # (como o GitHub exibe)", () => {
  assert.deepEqual(parsePrEntrada("#283"), { numero: 283, url: null });
});

test("aceita a URL do PR colada do navegador, e guarda o link", () => {
  const u = "https://github.com/edurcampos86-jpg/cockpit-onix/pull/283";
  assert.deepEqual(parsePrEntrada(u), { numero: 283, url: u });
});

test("URL com sufixo (/files, #discussion) ainda resolve o número", () => {
  const u = "https://github.com/dono/repo/pull/42/files";
  assert.equal(parsePrEntrada(u).numero, 42);
  assert.equal(parsePrEntrada("https://github.com/dono/repo/pull/42#issue-1").numero, 42);
});

test("espaço em volta não atrapalha (colar traz espaço)", () => {
  assert.equal(parsePrEntrada("  #7  ").numero, 7);
  assert.equal(parsePrEntrada(" https://github.com/a/b/pull/9 ").numero, 9);
});

test("vazio não é erro — é desistência", () => {
  assert.deepEqual(parsePrEntrada(""), { numero: null, url: null });
  assert.deepEqual(parsePrEntrada("   "), { numero: null, url: null });
});

test("texto que não é PR devolve null (a célula mostra erro)", () => {
  assert.equal(parsePrEntrada("abc").numero, null);
  assert.equal(parsePrEntrada("#").numero, null);
  assert.equal(parsePrEntrada("12a").numero, null);
});

test("URL de issue não vira PR", () => {
  // /issues/ não é /pull/ — vincular uma issue como PR estragaria a métrica.
  assert.equal(parsePrEntrada("https://github.com/a/b/issues/5").numero, null);
});

test("número negativo ou zero não passa", () => {
  assert.equal(parsePrEntrada("-3").numero, null);
  assert.equal(parsePrEntrada("0").numero, 0); // o servidor rejeita <= 0
});
