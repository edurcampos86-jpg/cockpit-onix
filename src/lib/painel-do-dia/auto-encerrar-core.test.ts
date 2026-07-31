import assert from "node:assert/strict";
import { test } from "node:test";

import {
  casarCliente,
  construirIndice,
  numerosDoTexto,
  soDigitos,
  type ClienteIdentificadores,
} from "./auto-encerrar-core.ts";

const ANA: ClienteIdentificadores = {
  id: "c-ana",
  nome: "Ana",
  email: "ana@exemplo.com",
  telefone: "(71) 99999-8888",
  cpfCnpj: "012.345.678-90",
  numeroConta: "123456",
};

const LIMA: ClienteIdentificadores = {
  id: "c-lima",
  nome: "Lima",
  email: "lima@exemplo.com",
  telefone: null,
  cpfCnpj: null,
  numeroConta: "987654",
};

const idx = (cs: ClienteIdentificadores[]) => construirIndice(cs).indice;

// ── Os dois falsos positivos que motivaram a mudança. Antes, o casamento era
// `tituloNormalizado.includes(nomeNormalizado)` e ambos davam match.

test("regressão — 'Ana' NÃO casa com a reunião 'Reunião Semana'", () => {
  const r = casarCliente({ titulo: "Reunião Semana" }, idx([ANA]));
  assert.equal(r, null);
});

test("regressão — 'Lima' NÃO casa com a reunião 'Preclimatização'", () => {
  const r = casarCliente({ titulo: "Preclimatização" }, idx([LIMA]));
  assert.equal(r, null);
});

test("nome do cliente no título não basta — sem identificador, não casa", () => {
  const r = casarCliente({ titulo: "Call com Ana Paula" }, idx([ANA]));
  assert.equal(r, null);
});

// ── Os 4 critérios aceitos.

test("e-mail — participante do convite casa", () => {
  const r = casarCliente(
    { titulo: "Reunião", participantes: ["eduardo@onix.com", "ana@exemplo.com"] },
    idx([ANA, LIMA]),
  );
  assert.equal(r?.id, "c-ana");
});

test("e-mail — casa ignorando maiúsculas e espaço", () => {
  const r = casarCliente(
    { titulo: "Reunião", participantes: ["  ANA@Exemplo.COM "] },
    idx([ANA]),
  );
  assert.equal(r?.id, "c-ana");
});

test("telefone — casa mesmo formatado diferente no título", () => {
  const r = casarCliente({ titulo: "Ligar 71 99999-8888" }, idx([ANA]));
  assert.equal(r?.id, "c-ana");
});

test("CPF — casa com pontuação no título", () => {
  const r = casarCliente({ titulo: "Revisão 012.345.678-90" }, idx([ANA]));
  assert.equal(r?.id, "c-ana");
});

test("número da conta — casa", () => {
  const r = casarCliente({ titulo: "Conta 987654 — ajuste" }, idx([LIMA]));
  assert.equal(r?.id, "c-lima");
});

// ── Regra do Eduardo: conta que começa com 0 não entra no índice.

test("conta começando com 0 fica fora do índice", () => {
  const cli = { ...LIMA, numeroConta: "0987654" };
  const { indice } = construirIndice([cli]);
  assert.equal(indice.has("0987654"), false);
  assert.equal(casarCliente({ titulo: "Conta 0987654" }, indice), null);
});

test("conta com 0 à esquerda não casa nem sem o zero", () => {
  const cli = { ...LIMA, numeroConta: "0987654" };
  const r = casarCliente({ titulo: "Conta 987654" }, idx([cli]));
  assert.equal(r, null);
});

// ── Ambiguidade: descartar, nunca desempatar.

test("identificador repetido em 2 clientes é descartado e contado", () => {
  const a = { ...ANA, id: "c-1", email: "mesmo@exemplo.com" };
  const b = { ...LIMA, id: "c-2", email: "mesmo@exemplo.com" };
  const { indice, ambiguos } = construirIndice([a, b]);
  assert.equal(ambiguos, 1);
  assert.equal(
    casarCliente({ titulo: "x", participantes: ["mesmo@exemplo.com"] }, indice),
    null,
  );
});

test("mesmo identificador no MESMO cliente não vira ambiguidade", () => {
  const { ambiguos } = construirIndice([ANA, ANA]);
  assert.equal(ambiguos, 0);
});

test("terceiro cliente com a chave já ambígua não a ressuscita", () => {
  const a = { ...ANA, id: "c-1", email: "x@e.com" };
  const b = { ...ANA, id: "c-2", email: "x@e.com" };
  const c = { ...ANA, id: "c-3", email: "x@e.com" };
  const { indice } = construirIndice([a, b, c]);
  assert.equal(indice.has("x@e.com"), false);
});

// ── Rejeições por tamanho mínimo.

test("número curto no título não casa com nada", () => {
  const cli = { ...LIMA, numeroConta: "12" };
  assert.equal(casarCliente({ titulo: "Sala 12" }, idx([cli])), null);
});

test("telefone curto demais não entra no índice", () => {
  const cli = { ...LIMA, telefone: "1234567", numeroConta: null };
  assert.equal(construirIndice([cli]).indice.has("1234567"), false);
});

test("documento com menos de 11 dígitos não entra no índice", () => {
  const cli = { ...LIMA, cpfCnpj: "1234567890", numeroConta: null };
  assert.equal(construirIndice([cli]).indice.has("1234567890"), false);
});

// ── Campos ausentes não quebram.

test("cliente sem nenhum identificador não gera entrada", () => {
  const cli: ClienteIdentificadores = { id: "c-x", nome: "Sem Dados" };
  assert.equal(construirIndice([cli]).indice.size, 0);
});

test("e-mail inválido (sem @) é ignorado", () => {
  const cli = { ...LIMA, email: "naoehemail", numeroConta: null };
  assert.equal(construirIndice([cli]).indice.has("naoehemail"), false);
});

// ── Helpers.

test("soDigitos remove tudo que não é dígito", () => {
  assert.equal(soDigitos("(71) 99999-8888"), "71999998888");
  assert.equal(soDigitos("012.345.678-90"), "01234567890");
});

test("numerosDoTexto lê sequências com separador como um número só", () => {
  assert.deepEqual(numerosDoTexto("CPF 012.345.678-90"), ["01234567890"]);
  assert.deepEqual(numerosDoTexto("sem numero"), []);
});

test("numerosDoTexto não repete o mesmo número", () => {
  assert.deepEqual(numerosDoTexto("conta 123456 e de novo 123456"), ["123456"]);
});

// ── Precedência.

test("e-mail tem precedência sobre número do título", () => {
  const r = casarCliente(
    { titulo: "Conta 987654", participantes: ["ana@exemplo.com"] },
    idx([ANA, LIMA]),
  );
  assert.equal(r?.id, "c-ana");
});
