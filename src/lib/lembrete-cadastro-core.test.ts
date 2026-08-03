import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assuntoEmail,
  itensPendentes,
  mensagemPessoal,
  resumoSlack,
  tratamento,
  type PendenciaPessoa,
} from "./lembrete-cadastro-core.ts";

const URL = "https://cockpit.onix";

const SO_TELEFONE: PendenciaPessoa = {
  nomeCompleto: "Ana Carolina de Vasconcelos",
  apelido: "Ana",
  semTelefone: true,
  emailPessoal: false,
};
const SO_EMAIL: PendenciaPessoa = {
  nomeCompleto: "Bruno Silva Souza",
  apelido: null,
  semTelefone: false,
  emailPessoal: true,
};
const AMBOS: PendenciaPessoa = { ...SO_TELEFONE, apelido: "Ana", emailPessoal: true };

// ── tratamento

test("usa apelido quando existe", () => {
  assert.equal(tratamento(SO_TELEFONE), "Ana");
});

test("sem apelido, usa o primeiro nome — não o nome inteiro", () => {
  // "Oi, Bruno Silva Souza!" soa como carta de cobrança, não como colega.
  assert.equal(tratamento(SO_EMAIL), "Bruno");
});

// ── itensPendentes: só o que falta para AQUELA pessoa

test("lista só a pendência que a pessoa tem", () => {
  assert.equal(itensPendentes(SO_TELEFONE).length, 1);
  assert.match(itensPendentes(SO_TELEFONE)[0], /telefone/);
  assert.equal(itensPendentes(SO_EMAIL).length, 1);
  assert.match(itensPendentes(SO_EMAIL)[0], /corporativo/);
  assert.equal(itensPendentes(AMBOS).length, 2);
});

test("cada item diz a CONSEQUÊNCIA, não só o campo", () => {
  // "preencha seu telefone" é ignorado; "sem ele você não recebe alerta de
  // cliente em risco" é atendido.
  assert.match(itensPendentes(SO_TELEFONE)[0], /alertas de cliente em risco/);
  assert.match(itensPendentes(SO_EMAIL)[0], /não é revogado/);
});

// ── mensagemPessoal

test("mensagem traz o link da própria ficha", () => {
  assert.ok(mensagemPessoal(SO_TELEFONE, URL).includes(`${URL}/time/eu`));
});

test("pluraliza conforme o número de pendências", () => {
  assert.match(mensagemPessoal(SO_TELEFONE, URL), /Falta um item/);
  assert.match(mensagemPessoal(AMBOS, URL), /Faltam 2 itens/);
});

test("não menciona pendência que a pessoa não tem", () => {
  const m = mensagemPessoal(SO_TELEFONE, URL);
  assert.ok(!m.includes("corporativo"), m);
});

// ── assuntoEmail

test("assunto é específico quando há uma pendência só", () => {
  assert.equal(assuntoEmail(SO_TELEFONE), "Cockpit: falta seu telefone");
  assert.equal(assuntoEmail(SO_EMAIL), "Cockpit: e-mail corporativo pendente");
});

test("assunto genérico quando há mais de uma", () => {
  assert.equal(assuntoEmail(AMBOS), "Cockpit: cadastro pendente");
});

// ── resumoSlack: placar, não cobrança individual

test("placar lista cada pessoa e o que falta", () => {
  const s = resumoSlack([SO_TELEFONE, SO_EMAIL], URL);
  assert.match(s, /2 pessoas/);
  assert.ok(s.includes("Ana"));
  assert.ok(s.includes("Bruno"));
  assert.match(s, /telefone/);
  assert.match(s, /e-mail pessoal/);
});

test("uma pessoa não vira 'pessoas'", () => {
  assert.match(resumoSlack([SO_TELEFONE], URL), /1 pessoa com/);
});

test("pendência dupla aparece somada na mesma linha", () => {
  assert.match(resumoSlack([AMBOS], URL), /telefone \+ e-mail pessoal/);
});

test("time completo tem mensagem própria, não placar vazio", () => {
  const s = resumoSlack([], URL);
  assert.match(s, /completo/);
  assert.ok(!s.includes("•"), s);
});
