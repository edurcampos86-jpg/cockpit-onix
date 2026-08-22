import { test } from "node:test";
import assert from "node:assert/strict";
import {
  filtrarReunioesPorEscopo,
  reuniaoEhDaPessoa,
  type EscopoReunioes,
} from "./escopo-reuniao";

const EDUARDO = ["Eduardo Rodrigues Campos", "Edu"];
const ROSE = ["Rose Maria de Oliveira"];

test("nome canônico do vendedor casa com o nome completo do cadastro", () => {
  assert.equal(reuniaoEhDaPessoa("Eduardo Campos", EDUARDO), true);
  assert.equal(reuniaoEhDaPessoa("Rose Oliveira", ROSE), true);
});

test("reunião de outro vendedor não é minha", () => {
  assert.equal(reuniaoEhDaPessoa("Thiago Vergal", EDUARDO), false);
  assert.equal(reuniaoEhDaPessoa("Eduardo Campos", ROSE), false);
});

test("acento e caixa não decidem nada", () => {
  assert.equal(reuniaoEhDaPessoa("ROSE OLIVEIRA", ["Rosé Maria de Oliveira"]), true);
});

test("contenção é de mão única — vendedor curto casa pessoa longa, nunca o contrário", () => {
  // "Eduardo" solto não pode casar com um Eduardo qualquer do time...
  assert.equal(reuniaoEhDaPessoa("Eduardo", ["Eduardo Rodrigues Campos"]), true);
  // ...mas o nome MAIS específico do vendedor não casa a pessoa genérica.
  assert.equal(reuniaoEhDaPessoa("Eduardo Rodrigues Campos", ["Eduardo"]), false);
});

test("sem vendedor declarado, a reunião não é de ninguém", () => {
  assert.equal(reuniaoEhDaPessoa(null, EDUARDO), false);
  assert.equal(reuniaoEhDaPessoa("", EDUARDO), false);
  assert.equal(reuniaoEhDaPessoa("   ", EDUARDO), false);
  assert.equal(reuniaoEhDaPessoa(undefined, EDUARDO), false);
});

test("pessoa sem nenhum nome no cadastro não vê nada por este eixo", () => {
  assert.equal(reuniaoEhDaPessoa("Eduardo Campos", []), false);
  assert.equal(reuniaoEhDaPessoa("Eduardo Campos", ["", "  "]), false);
});

/* ── O filtro da lista ─────────────────────────────────────────────────── */

const LISTA = [
  { id: "1", vendedor: "Eduardo Campos" },
  { id: "2", vendedor: "Thiago Vergal" },
  { id: "3", vendedor: null },
];

test("escopo 'tudo' não filtra nada — postura não-disruptiva do RBAC", () => {
  const escopo: EscopoReunioes = { tipo: "tudo" };
  assert.deepEqual(filtrarReunioesPorEscopo(LISTA, escopo).map((r) => r.id), ["1", "2", "3"]);
});

test("escopo restrito devolve só as minhas — e a sem dono NÃO entra", () => {
  const escopo: EscopoReunioes = { tipo: "so-minhas", nomesDaPessoa: EDUARDO };
  assert.deepEqual(filtrarReunioesPorEscopo(LISTA, escopo).map((r) => r.id), ["1"]);
});

test("escopo restrito de quem não tem nenhuma reunião devolve lista vazia", () => {
  const escopo: EscopoReunioes = { tipo: "so-minhas", nomesDaPessoa: ["Fulano de Tal"] };
  assert.deepEqual(filtrarReunioesPorEscopo(LISTA, escopo), []);
});

test("lista vazia não quebra", () => {
  assert.deepEqual(filtrarReunioesPorEscopo([], { tipo: "tudo" }), []);
  assert.deepEqual(
    filtrarReunioesPorEscopo([], { tipo: "so-minhas", nomesDaPessoa: EDUARDO }),
    [],
  );
});
