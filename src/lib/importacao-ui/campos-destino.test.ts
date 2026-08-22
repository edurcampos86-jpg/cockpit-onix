/**
 * Testes da lista de destinos da tela de mapeamento.
 *
 * O que importa aqui é o PRIMEIRO teste: ele lê o fonte do motor e falha se a
 * duplicata divergir. Sem ele, esta lista é só uma cópia envelhecendo em
 * silêncio — a tela ofereceria um campo que o motor joga fora, e ninguém
 * descobriria até um relatório inteiro entrar torto.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CAMPOS_DESTINO,
  CAMPOS_DO_CONTRATO,
  CAMPOS_OBRIGATORIOS,
  CAMPOS_COM_DICIONARIO,
  destinosDuplicados,
  faltamObrigatorios,
  rotuloDoCampo,
} from "./campos-destino.ts";
import { FORMATOS_VALOR } from "@/lib/importacao/perfil";

/** Extrai as chaves de `CAMPOS_COM_COLUNA` direto do fonte do motor. */
function camposDoMotor(): string[] {
  const fonte = readFileSync(
    join(process.cwd(), "src/lib/corretora/importar-contratos.ts"),
    "utf8",
  );
  const bloco = /const CAMPOS_COM_COLUNA = new Set\(\[([\s\S]*?)\]\)/.exec(fonte);
  assert.ok(bloco, "não achei CAMPOS_COM_COLUNA no motor — o teste-guarda ficou cego");
  return [...bloco[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
}

test("a lista da tela não diverge de CAMPOS_COM_COLUNA no motor", () => {
  const motor = [...camposDoMotor()].sort();
  const tela = CAMPOS_DESTINO.map((c) => c.campo).sort();
  assert.deepEqual(
    tela,
    motor,
    "a tela e o motor discordam de quais campos existem — atualize src/lib/importacao-ui/campos-destino.ts",
  );
});

test("dataReferencia é competência, não campo de contrato", () => {
  // Está em CAMPOS_COM_COLUNA, mas não é coluna de ContratoCorretora: vai para
  // `importadoEm`. Se ele vazar para CAMPOS_DO_CONTRATO, a tela ensina errado
  // exatamente onde errar inverte a proteção de precedência.
  const referencia = CAMPOS_DESTINO.find((c) => c.campo === "dataReferencia");
  assert.equal(referencia?.grupo, "competencia");
  assert.ok(!CAMPOS_DO_CONTRATO.some((c) => c.campo === "dataReferencia"));
  assert.ok(!CAMPOS_OBRIGATORIOS.includes("dataReferencia"));
});

test("os obrigatórios são os cinco que o motor recusa quando faltam", () => {
  assert.deepEqual([...CAMPOS_OBRIGATORIOS].sort(), [
    "cpfCnpj",
    "inicioVigencia",
    "numeroContrato",
    "status",
    "tipoProduto",
  ]);
});

test("todo formato sugerido é um FormatoValor de verdade", () => {
  for (const campo of CAMPOS_DESTINO) {
    if (campo.formatoSugerido === null) continue;
    assert.ok(
      (FORMATOS_VALOR as readonly string[]).includes(campo.formatoSugerido),
      `${campo.campo} sugere um formato que o perfil não aceita: ${campo.formatoSugerido}`,
    );
  }
});

test("nenhum campo repetido e nenhum rótulo repetido", () => {
  const campos = CAMPOS_DESTINO.map((c) => c.campo);
  const rotulos = CAMPOS_DESTINO.map((c) => c.rotulo);
  assert.equal(new Set(campos).size, campos.length);
  assert.equal(new Set(rotulos).size, rotulos.length, "dois destinos com o mesmo nome na tela");
});

test("os campos que exigem dicionário existem na lista", () => {
  for (const campo of CAMPOS_COM_DICIONARIO) {
    assert.ok(CAMPOS_DESTINO.some((c) => c.campo === campo), `${campo} não existe`);
  }
});

test("faltamObrigatorios diz o que falta, e nada quando está completo", () => {
  assert.deepEqual(faltamObrigatorios({}), [...CAMPOS_OBRIGATORIOS]);

  const completo = {
    "CPF/CNPJ": "cpfCnpj",
    Produto: "tipoProduto",
    Apólice: "numeroContrato",
    Situação: "status",
    Início: "inicioVigencia",
  };
  assert.deepEqual(faltamObrigatorios(completo), []);

  const semStatus = { ...completo };
  delete (semStatus as Record<string, string>)["Situação"];
  assert.deepEqual(faltamObrigatorios(semStatus), ["status"]);
});

test("faltamObrigatorios olha o destino, não o rótulo da planilha", () => {
  // Duas colunas do arquivo apontando para o mesmo destino não "completam"
  // dois obrigatórios — erro fácil de cometer contando chaves em vez de valores.
  const duplicado = { "CPF": "cpfCnpj", "CNPJ": "cpfCnpj" };
  assert.ok(faltamObrigatorios(duplicado).includes("tipoProduto"));
  assert.ok(!faltamObrigatorios(duplicado).includes("cpfCnpj"));
});

test("rotuloDoCampo devolve o rótulo, e a própria chave quando não conhece", () => {
  assert.equal(rotuloDoCampo("cpfCnpj"), "CPF ou CNPJ");
  assert.equal(rotuloDoCampo("campoQueNaoExiste"), "campoQueNaoExiste");
});

test("destinosDuplicados repete a régua do servidor antes do envio", () => {
  assert.deepEqual(destinosDuplicados({ "CPF": "cpfCnpj", "Produto": "tipoProduto" }), []);
  assert.deepEqual(destinosDuplicados({ "CPF": "cpfCnpj", "CNPJ": "cpfCnpj" }), [
    { campo: "cpfCnpj", origens: ["CPF", "CNPJ"] },
  ]);
});
