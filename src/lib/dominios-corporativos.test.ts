import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DOMINIOS_CORPORATIVOS,
  dominioDoEmail,
  isEmailCorporativo,
  listaDominiosCorporativos,
} from "./dominios-corporativos.ts";

// ── dominioDoEmail

test("extrai o domínio em minúsculas", () => {
  assert.equal(dominioDoEmail("Eduardo.Rodrigues@OnixCapital.com.br"), "onixcapital.com.br");
  assert.equal(dominioDoEmail("  ana@oniximob.com  "), "oniximob.com");
});

test("sem @ não há domínio", () => {
  for (const v of ["", "   ", "eduardo", null, undefined]) {
    assert.equal(dominioDoEmail(v), "", `entrada=${JSON.stringify(v)}`);
  }
});

test("usa o ÚLTIMO @ — o que separa local-part de domínio", () => {
  assert.equal(dominioDoEmail('"a@b"@onixcapital.com.br'), "onixcapital.com.br");
});

// ── isEmailCorporativo

test("aceita os três domínios do grupo", () => {
  assert.ok(isEmailCorporativo("eduardo.rodrigues@onixcapital.com.br"));
  assert.ok(isEmailCorporativo("renan@oniximob.com"));
  assert.ok(isEmailCorporativo("rose.oliveira@onxcorretora.com.br"));
});

test("aceita subdomínio — a empresa também controla e revoga", () => {
  assert.ok(isEmailCorporativo("ti@interno.onixcapital.com.br"));
});

test("recusa conta pessoal", () => {
  // O caso real: 3 das 20 pessoas versionadas usam @gmail.com como identidade.
  for (const v of ["alguem@gmail.com", "alguem@hotmail.com", "alguem@outlook.com"]) {
    assert.ok(!isEmailCorporativo(v), `entrada=${v}`);
  }
});

test("recusa sufixo colado — domínio parecido é de outro dono", () => {
  // "fakeonixcapital.com.br" termina com "onixcapital.com.br" por acaso de
  // string; sem a checagem do ponto, um domínio de terceiro entraria.
  assert.ok(!isEmailCorporativo("alguem@fakeonixcapital.com.br"));
  assert.ok(!isEmailCorporativo("alguem@onixcapital.com.br.evil.com"));
});

test("recusa vazio e nulo", () => {
  for (const v of ["", "   ", "sem-arroba", null, undefined]) {
    assert.ok(!isEmailCorporativo(v), `entrada=${JSON.stringify(v)}`);
  }
});

test("case não importa", () => {
  assert.ok(isEmailCorporativo("ANA@ONIXCAPITAL.COM.BR"));
});

// ── listaDominiosCorporativos (texto de erro / placeholder)

test("lista legível cobre todos os domínios", () => {
  const texto = listaDominiosCorporativos();
  for (const d of DOMINIOS_CORPORATIVOS) {
    assert.ok(texto.includes(d), `faltou ${d} em "${texto}"`);
  }
  assert.ok(texto.includes(" ou "));
});
