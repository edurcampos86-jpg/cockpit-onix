/**
 * Testes de conversão de valor — sem banco.
 *
 * O que estes testes protegem é um número só: o que vai para um campo de
 * dinheiro ou de vigência. Todos os casos abaixo já quebraram import de
 * planilha em algum lugar; nenhum deles falha ruidosamente por conta própria.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { converterValor } from "./valores.ts";

function valor(bruto: string, formato: Parameters<typeof converterValor>[1]) {
  const r = converterValor(bruto, formato);
  assert.ok(r.ok, `esperava sucesso, veio: ${r.ok ? "" : r.erro}`);
  return r.valor;
}

function erro(bruto: string, formato: Parameters<typeof converterValor>[1]) {
  const r = converterValor(bruto, formato);
  assert.equal(r.ok, false, `esperava erro para ${JSON.stringify(bruto)}`);
  return r.ok ? "" : r.erro;
}

test("célula vazia é ausência de dado, não erro", () => {
  assert.equal(valor("", "decimal_ptbr"), null);
  assert.equal(valor("   ", "data_ddmmaaaa"), null);
  assert.equal(valor("", "documento_digitos"), null);
});

// ── Dinheiro: o erro de três ordens de grandeza ──────────────────────────

test("decimal_ptbr entende milhar com ponto e decimal com vírgula", () => {
  assert.equal(valor("1.234,56", "decimal_ptbr"), 1234.56);
  assert.equal(valor("R$ 1.234,56", "decimal_ptbr"), 1234.56);
  assert.equal(valor("0,10", "decimal_ptbr"), 0.1);
  assert.equal(valor("-89,90", "decimal_ptbr"), -89.9);
  assert.equal(valor("1234", "decimal_ptbr"), 1234);
});

test("decimal_iso é o espelho, e ler um pelo outro erraria feio", () => {
  assert.equal(valor("1,234.56", "decimal_iso"), 1234.56);
  // A prova do porquê os dois formatos existem: a MESMA string dá números
  // diferentes conforme a convenção declarada.
  assert.equal(valor("1.234", "decimal_iso"), 1.234);
  assert.equal(valor("1.234", "decimal_ptbr"), 1234);
});

test("texto que não é número devolve erro, não NaN", () => {
  assert.match(erro("a combinar", "decimal_ptbr"), /decimal_ptbr não reconhece/);
  assert.match(erro("-", "inteiro"), /inteiro não reconhece/);
});

// ── Data: 03/04 é abril ou março? ────────────────────────────────────────

test("data_ddmmaaaa lê dia primeiro; data_mmddaaaa lê mês primeiro", () => {
  const br = valor("03/04/2026", "data_ddmmaaaa") as Date;
  assert.equal(br.toISOString().slice(0, 10), "2026-04-03");
  const us = valor("03/04/2026", "data_mmddaaaa") as Date;
  assert.equal(us.toISOString().slice(0, 10), "2026-03-04");
});

test("aceita separadores diferentes e ano de dois dígitos", () => {
  assert.equal((valor("05-03-2024", "data_ddmmaaaa") as Date).toISOString().slice(0, 10), "2024-03-05");
  assert.equal((valor("05/03/24", "data_ddmmaaaa") as Date).toISOString().slice(0, 10), "2024-03-05");
  assert.equal((valor("05/03/89", "data_ddmmaaaa") as Date).toISOString().slice(0, 10), "1989-03-05");
  assert.equal((valor("2026-04-03", "data_iso") as Date).toISOString().slice(0, 10), "2026-04-03");
});

test("a data é gravada ao MEIO-DIA UTC, não à meia-noite", () => {
  // Meia-noite UTC vira o dia anterior em GMT-3, e um contrato que começou dia
  // 1º passaria a constar como do dia 31.
  const d = valor("01/09/2026", "data_ddmmaaaa") as Date;
  assert.equal(d.getUTCHours(), 12);
  assert.equal(d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), "01/09/2026");
});

test("data inexistente é rejeitada em vez de 'corrigida'", () => {
  // O Date do JS transforma 31/02 em 03/03 sem avisar ninguém.
  assert.match(erro("31/02/2026", "data_ddmmaaaa"), /data inexistente/);
  assert.match(erro("15/13/2026", "data_ddmmaaaa"), /fora de faixa/);
  assert.match(erro("amanhã", "data_ddmmaaaa"), /não reconhece/);
});

// ── Documento: o campo do qual o casamento depende ───────────────────────

test("documento_digitos aceita CPF e CNPJ com ou sem máscara", () => {
  assert.equal(valor("097.146.005-10", "documento_digitos"), "09714600510");
  assert.equal(valor("09714600510", "documento_digitos"), "09714600510");
  assert.equal(valor("12.345.678/0001-95", "documento_digitos"), "12345678000195");
});

test("documento com tamanho errado NÃO passa", () => {
  // É por aqui que entraria um casamento com a pessoa errada: um documento
  // truncado casa com ninguém, ou pior, com outro alguém.
  assert.match(erro("9714600510", "documento_digitos"), /10 dígitos/);
  assert.match(erro("123", "documento_digitos"), /3 dígitos/);
  assert.match(erro("097146005100000", "documento_digitos"), /15 dígitos/);
});

test("booleano_sim_nao cobre as grafias que aparecem em planilha", () => {
  for (const s of ["Sim", "S", "1", "true"]) assert.equal(valor(s, "booleano_sim_nao"), true);
  for (const n of ["Não", "nao", "N", "0"]) assert.equal(valor(n, "booleano_sim_nao"), false);
  assert.match(erro("talvez", "booleano_sim_nao"), /não reconhece/);
});

test("texto só apara espaço — não normaliza nada", () => {
  assert.equal(valor("  Porto Seguro  ", "texto"), "Porto Seguro");
  assert.equal(valor("VIDA EM GRUPO", "texto"), "VIDA EM GRUPO");
});
