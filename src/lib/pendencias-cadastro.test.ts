import assert from "node:assert/strict";
import { test } from "node:test";

import { casaPendencia, pendenciasDe } from "./pendencias-cadastro.ts";

/**
 * Testes da regra de pendência de cadastro — sobre o módulo REAL.
 *
 * A regra mora em ./pendencias-cadastro justamente para caber aqui: `team.ts`
 * é `server-only` e importa prisma, e um teste que reimplementasse a regra
 * passaria mesmo se o código divergisse — trava de mentira.
 *
 * Vale travar porque a mesma regra decide três coisas: os badges de cada card,
 * o contador do topo e o filtro. Divergir entre elas significa o número do topo
 * não bater com a lista logo abaixo.
 */

type P = {
  status: string;
  cargoFamilia: string;
  codigoAssessorBtg: string | null;
  telefone: string | null;
  email: string;
};

const OK: P = {
  status: "ativo",
  cargoFamilia: "socio",
  codigoAssessorBtg: "2108333",
  telefone: "(71) 99999-9999",
  email: "alguem@onixcapital.com.br",
};

// ── Quem é pendência

test("cadastro completo não tem pendência", () => {
  const d = pendenciasDe(OK);
  assert.deepEqual(d, { semCodigoBtg: false, semTelefone: false, emailPessoal: false });
});

test("sócio sem código BTG é pendência", () => {
  assert.ok(pendenciasDe({ ...OK, codigoAssessorBtg: null }).semCodigoBtg);
});

test("imobiliária, corretora e qualidade sem código NÃO são pendência", () => {
  // Não têm vínculo com o BTG — ausência ali é o estado certo.
  for (const cargo of ["imobiliaria", "corretora", "qualidade", "administrativo"]) {
    const d = pendenciasDe({ ...OK, cargoFamilia: cargo, codigoAssessorBtg: null });
    assert.ok(!d.semCodigoBtg, `cargo=${cargo}`);
  }
});

test("assessor_investimentos sem código é pendência", () => {
  const d = pendenciasDe({
    ...OK,
    cargoFamilia: "assessor_investimentos",
    codigoAssessorBtg: null,
  });
  assert.ok(d.semCodigoBtg);
});

test("telefone vazio é pendência", () => {
  assert.ok(pendenciasDe({ ...OK, telefone: null }).semTelefone);
  assert.ok(pendenciasDe({ ...OK, telefone: "" }).semTelefone);
});

test("e-mail pessoal é pendência, corporativo não", () => {
  assert.ok(pendenciasDe({ ...OK, email: "alguem@gmail.com" }).emailPessoal);
  assert.ok(!pendenciasDe({ ...OK, email: "alguem@oniximob.com" }).emailPessoal);
});

test("arquivado nunca tem pendência, por pior que esteja o cadastro", () => {
  // Quem saiu não vai preencher telefone nem migrar e-mail. Contá-lo infla o
  // número do topo com trabalho que ninguém vai fazer.
  const d = pendenciasDe({
    status: "arquivado",
    cargoFamilia: "socio",
    codigoAssessorBtg: null,
    telefone: null,
    email: "alguem@gmail.com",
  });
  assert.deepEqual(d, { semCodigoBtg: false, semTelefone: false, emailPessoal: false });
});

// ── O que cada filtro recorta

test("cada tipo recorta só a sua pendência", () => {
  const soTelefone = { ...OK, telefone: null };
  assert.ok(casaPendencia(soTelefone, "telefone"));
  assert.ok(!casaPendencia(soTelefone, "codigo"));
  assert.ok(!casaPendencia(soTelefone, "email"));
  assert.ok(casaPendencia(soTelefone, "1"), '"1" pega qualquer uma');
});

test("quem tem tudo certo não entra em nenhum recorte", () => {
  for (const t of ["1", "codigo", "telefone", "email"] as const) {
    assert.ok(!casaPendencia(OK, t), `tipo=${t}`);
  }
});

test("pendência múltipla aparece em cada recorte correspondente", () => {
  const tudo = { ...OK, codigoAssessorBtg: null, telefone: null, email: "x@gmail.com" };
  for (const t of ["1", "codigo", "telefone", "email"] as const) {
    assert.ok(casaPendencia(tudo, t), `tipo=${t}`);
  }
});

// ── O caso que motivou a quebra do contador

test("o cenário real: telefone domina e esconde o resto num número só", () => {
  // Medido em shadow-DB com os 20 do recover-team-data: 19 de 19 têm alguma
  // pendência, mas 17 são só telefone. Um total único não diz por onde começar.
  const time: P[] = [
    ...Array.from({ length: 17 }, () => ({ ...OK, telefone: null })),
    { ...OK, codigoAssessorBtg: null },
    { ...OK, email: "x@gmail.com" },
  ];
  assert.equal(time.filter((p) => casaPendencia(p, "1")).length, 19);
  assert.equal(time.filter((p) => casaPendencia(p, "telefone")).length, 17);
  assert.equal(time.filter((p) => casaPendencia(p, "codigo")).length, 1);
  assert.equal(time.filter((p) => casaPendencia(p, "email")).length, 1);
});
