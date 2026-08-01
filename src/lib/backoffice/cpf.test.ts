import assert from "node:assert/strict";
import { test } from "node:test";

import { chaveCpf, cpfValido, formatarCpf, mascararCpf } from "./cpf.ts";

// CPFs sintéticos (dígitos verificadores calculados), nunca de pessoa real.
const VALIDO = "52998224725";
const VALIDO_COM_ZERO = "01234567890";

// ── chaveCpf: o formato que o banco guarda e que o BTG exporta.

test("pontuação some, dígitos permanecem", () => {
  assert.equal(chaveCpf("529.982.247-25"), VALIDO);
  assert.equal(chaveCpf(" 529 982 247 25 "), VALIDO);
});

test("zero à esquerda é identidade em CPF, não formatação", () => {
  // Ao contrário de numeroConta (./conta.ts), aqui o zero NÃO pode cair:
  // "01234567890" e "1234567890" seriam documentos diferentes.
  assert.equal(chaveCpf("012.345.678-90"), VALIDO_COM_ZERO);
  assert.equal(chaveCpf(VALIDO_COM_ZERO).length, 11);
});

test("idempotente", () => {
  assert.equal(chaveCpf(chaveCpf("529.982.247-25")), VALIDO);
});

test("vazio, nulo e só pontuação devolvem string vazia", () => {
  for (const v of ["", "   ", ".-", null, undefined]) {
    assert.equal(chaveCpf(v), "", `entrada=${JSON.stringify(v)}`);
  }
});

// ── cpfValido: o que separa "11 dígitos" de "um CPF".

test("aceita CPF válido em qualquer formatação", () => {
  assert.ok(cpfValido(VALIDO));
  assert.ok(cpfValido("529.982.247-25"));
  assert.ok(cpfValido(VALIDO_COM_ZERO));
});

test("um dígito trocado reprova", () => {
  // O caso que motiva a validação: erro de digitação vira chave única no banco
  // e nunca casa com o BTG, sem nenhum sinal na tela.
  assert.ok(!cpfValido("52998224726"));
  assert.ok(!cpfValido("52998224715"));
});

test("sequência repetida reprova mesmo passando no cálculo", () => {
  for (const v of ["00000000000", "11111111111", "99999999999"]) {
    assert.ok(!cpfValido(v), `entrada=${v}`);
  }
});

test("tamanho errado reprova", () => {
  for (const v of ["5299822472", "529982247255", "", null, undefined]) {
    assert.ok(!cpfValido(v), `entrada=${JSON.stringify(v)}`);
  }
});

// ── formatarCpf: só exibição.

test("formata documento completo", () => {
  assert.equal(formatarCpf(VALIDO), "529.982.247-25");
  assert.equal(formatarCpf(VALIDO_COM_ZERO), "012.345.678-90");
});

test("formatar é reversível por chaveCpf", () => {
  assert.equal(chaveCpf(formatarCpf(VALIDO)), VALIDO);
});

test("entrada incompleta volta intacta em vez de virar lixo formatado", () => {
  assert.equal(formatarCpf("5299822"), "5299822");
  assert.equal(formatarCpf(null), "");
});

// ── mascararCpf: enquanto digita.

test("máscara cresce a cada dígito", () => {
  assert.equal(mascararCpf("5"), "5");
  assert.equal(mascararCpf("529"), "529");
  assert.equal(mascararCpf("5299"), "529.9");
  assert.equal(mascararCpf("529982"), "529.982");
  assert.equal(mascararCpf("5299822"), "529.982.2");
  assert.equal(mascararCpf("529982247"), "529.982.247");
  assert.equal(mascararCpf("5299822472"), "529.982.247-2");
  assert.equal(mascararCpf(VALIDO), "529.982.247-25");
});

test("máscara não deixa passar do 11º dígito", () => {
  assert.equal(mascararCpf("5299822472599999"), "529.982.247-25");
});

test("máscara é idempotente (reaplicar no valor já mascarado não duplica)", () => {
  assert.equal(mascararCpf(mascararCpf("529.982.247-25")), "529.982.247-25");
});
