import assert from "node:assert/strict";
import { test } from "node:test";

import {
  agruparPorDocumento,
  classificarTipo,
  contatoUneSozinho,
  normalizarDocumento,
  podemUnir,
} from "./pessoa-grupo.ts";

// Documentos sintéticos, nunca de pessoa real.
const CPF = "52998224725";
const CPF_COM_ZERO = "01234567890";
const CPF_OUTRO = "12345678909";
const CNPJ = "11222333000181";
const CNPJ_OUTRO = "11444777000161";

// ── normalizarDocumento ────────────────────────────────────────────────────

test("máscara some, dígitos permanecem", () => {
  assert.equal(normalizarDocumento("529.982.247-25"), CPF);
  assert.equal(normalizarDocumento("11.222.333/0001-81"), CNPJ);
  assert.equal(normalizarDocumento(" 529 982 247 25 "), CPF);
});

test("zero à esquerda é identidade, não formatação", () => {
  // Ao contrário de numeroConta (backoffice/conta.ts), aqui o zero não cai:
  // "01234567890" e "1234567890" seriam documentos diferentes — e o segundo
  // nem é documento, por ter 10 dígitos.
  assert.equal(normalizarDocumento("012.345.678-90"), CPF_COM_ZERO);
  assert.equal(normalizarDocumento(CPF_COM_ZERO)?.length, 11);
});

test("idempotente", () => {
  assert.equal(normalizarDocumento(normalizarDocumento("529.982.247-25")), CPF);
});

test("tamanho fora de 11 e 14 devolve null, não string vazia", () => {
  // null obriga o chamador a decidir; "" viraria chave UNIQUE plausível.
  for (const v of ["123", "1234567890", "123456789012", "111222333000181"]) {
    assert.equal(normalizarDocumento(v), null, `entrada=${v}`);
  }
});

test("vazio, nulo e só pontuação devolvem null", () => {
  for (const v of ["", "   ", ".-/", "N/A", null, undefined]) {
    assert.equal(normalizarDocumento(v), null, `entrada=${JSON.stringify(v)}`);
  }
});

test("dígito verificador NÃO é validado aqui", () => {
  // 11 dígitos com DV inválido continua sendo identificador que o BTG pode ter
  // exportado. Recusá-lo aqui perderia o vínculo em vez de sinalizá-lo — a
  // régua estrita vive em cpfValido() (backoffice/cpf.ts) e é ortogonal.
  assert.equal(normalizarDocumento("11111111111"), "11111111111");
});

// ── classificarTipo ────────────────────────────────────────────────────────

test("11 dígitos é CPF, 14 é CNPJ", () => {
  assert.equal(classificarTipo(CPF), "CPF");
  assert.equal(classificarTipo(CNPJ), "CNPJ");
});

test("classifica a partir do valor mascarado, sem exigir normalização antes", () => {
  assert.equal(classificarTipo("529.982.247-25"), "CPF");
  assert.equal(classificarTipo("11.222.333/0001-81"), "CNPJ");
});

test("não-documento não tem tipo", () => {
  assert.equal(classificarTipo("123"), null);
  assert.equal(classificarTipo(null), null);
});

// ── podemUnir: as uniões legítimas ─────────────────────────────────────────

test("CPF com CPF igual une", () => {
  const r = podemUnir("529.982.247-25", CPF);
  assert.equal(r.une, true);
  assert.equal(r.une === true && r.documento, CPF);
  assert.equal(r.une === true && r.tipo, "CPF");
});

test("CNPJ com CNPJ igual une", () => {
  const r = podemUnir("11.222.333/0001-81", CNPJ);
  assert.equal(r.une, true);
  assert.equal(r.une === true && r.tipo, "CNPJ");
});

test("união é simétrica", () => {
  assert.equal(podemUnir(CPF, "529.982.247-25").une, true);
  assert.equal(podemUnir("529.982.247-25", CPF).une, true);
});

// ── podemUnir: as recusas ──────────────────────────────────────────────────

test("CPF com CNPJ NUNCA une automaticamente", () => {
  // A regra que mais importa: sócio e empresa são titulares distintos, com
  // patrimônio e tributação próprios. Unir misturaria dois patrimônios.
  const r = podemUnir(CPF, CNPJ);
  assert.equal(r.une, false);
  assert.equal(r.une === false && r.motivo, "tipos_diferentes");
});

test("CNPJ com CPF também não une (recusa é simétrica)", () => {
  const r = podemUnir(CNPJ, CPF);
  assert.equal(r.une, false);
  assert.equal(r.une === false && r.motivo, "tipos_diferentes");
});

test("dois CPFs diferentes não unem", () => {
  const r = podemUnir(CPF, CPF_OUTRO);
  assert.equal(r.une, false);
  assert.equal(r.une === false && r.motivo, "documentos_diferentes");
});

test("dois CNPJs diferentes não unem", () => {
  const r = podemUnir(CNPJ, CNPJ_OUTRO);
  assert.equal(r.une, false);
  assert.equal(r.une === false && r.motivo, "documentos_diferentes");
});

test("documento inválido de qualquer lado recusa", () => {
  for (const par of [
    [CPF, "123"],
    ["123", CPF],
    [null, CPF],
    [CPF, undefined],
    ["", ""],
  ] as const) {
    const r = podemUnir(par[0], par[1]);
    assert.equal(r.une, false, `par=${JSON.stringify(par)}`);
    assert.equal(r.une === false && r.motivo, "documento_invalido");
  }
});

// ── contato não une ────────────────────────────────────────────────────────

test("e-mail e telefone não unem sozinhos", () => {
  // Casal divide e-mail, empresa divide telefone. O recon mede a repetição
  // (recon-identidade, item 8) como ESTIMATIVA para conciliação manual.
  assert.equal(contatoUneSozinho(), false);
});

// ── agruparPorDocumento ────────────────────────────────────────────────────

test("agrupa iguais por dígitos, ignorando máscara", () => {
  const { grupos, invalidos } = agruparPorDocumento([
    "529.982.247-25",
    CPF,
    CNPJ,
  ]);
  assert.deepEqual(grupos.get(CPF), [0, 1]);
  assert.deepEqual(grupos.get(CNPJ), [2]);
  assert.deepEqual(invalidos, []);
});

test("inválidos ficam de fora em vez de virarem um grupo só", () => {
  // Sem isso, todo lixo do import ("", "N/A", "-") colapsaria numa chave
  // vazia e viraria "a mesma pessoa".
  const { grupos, invalidos } = agruparPorDocumento([CPF, "", "N/A", null, "123"]);
  assert.equal(grupos.size, 1);
  assert.deepEqual(grupos.get(CPF), [0]);
  assert.deepEqual(invalidos, [1, 2, 3, 4]);
});

test("CPF e CNPJ nunca caem no mesmo grupo", () => {
  const { grupos } = agruparPorDocumento([CPF, CNPJ]);
  assert.equal(grupos.size, 2);
});

test("lista vazia não quebra", () => {
  const { grupos, invalidos } = agruparPorDocumento([]);
  assert.equal(grupos.size, 0);
  assert.deepEqual(invalidos, []);
});
