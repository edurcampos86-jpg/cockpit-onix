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
// O motor é importado só aqui, no teste: o módulo de UI continua sem depender
// dele. Chamar `montarRegistro` é o que torna o guarda dos obrigatórios real.
import { montarRegistro } from "@/lib/corretora/importar-contratos";

function fonteDoMotor(): string {
  return readFileSync(join(process.cwd(), "src/lib/corretora/importar-contratos.ts"), "utf8");
}

/**
 * Extrai as chaves de `CAMPOS_COM_COLUNA` direto do fonte do motor.
 *
 * Tira os comentários ANTES de casar as aspas: o Set tem comentário dentro, e
 * sem isto bastaria remover um campo e citá-lo entre aspas num comentário ali
 * para o guarda continuar verde — cego exatamente no caso que ele existe para
 * pegar.
 */
function camposDoMotor(): string[] {
  const bloco = /const CAMPOS_COM_COLUNA = new Set\(\[([\s\S]*?)\]\)/.exec(fonteDoMotor());
  assert.ok(bloco, "não achei CAMPOS_COM_COLUNA no motor — o teste-guarda ficou cego");
  const semComentarios = bloco[1].replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return [...semComentarios.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
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

test("nome está na lista, mas marcado como descartado", () => {
  // Ele está em CAMPOS_COM_COLUNA e não é gravado em lugar nenhum: PessoaGrupo
  // não tem coluna de nome e ContratoCorretora também não. Some da lista →
  // quebra a paridade com o motor; entra sem marca → a pessoa mapeia uma
  // coluna, confere o ensaio, e o banco fica sem nome.
  const nome = CAMPOS_DESTINO.find((c) => c.campo === "nome");
  assert.equal(nome?.destino, "descartado");
  assert.ok(nome?.rotulo.includes("descartado"), "o rótulo precisa avisar na própria lista");
  assert.ok(!CAMPOS_DO_CONTRATO.some((c) => c.campo === "nome"));
});

test("todo campo de CAMPOS_DO_CONTRATO tem destino de contrato", () => {
  assert.ok(CAMPOS_DO_CONTRATO.every((c) => c.destino === "contrato"));
  assert.equal(CAMPOS_DO_CONTRATO.length, CAMPOS_DESTINO.length - 2);
});

test("dataReferencia é competência, não campo de contrato", () => {
  // Está em CAMPOS_COM_COLUNA, mas não é coluna de ContratoCorretora: vai para
  // `importadoEm`. Se ele vazar para CAMPOS_DO_CONTRATO, a tela ensina errado
  // exatamente onde errar inverte a proteção de precedência.
  const referencia = CAMPOS_DESTINO.find((c) => c.campo === "dataReferencia");
  assert.equal(referencia?.grupo, "competencia");
  assert.equal(referencia?.destino, "competencia");
  assert.ok(!CAMPOS_DO_CONTRATO.some((c) => c.campo === "dataReferencia"));
  assert.ok(!CAMPOS_OBRIGATORIOS.includes("dataReferencia"));
});

test("o Set ainda filtra dadosProduto do jeito certo", () => {
  // Casar só `CAMPOS_COM_COLUNA.has(` provaria uso, não SENTIDO: inverter o
  // filtro para `if (!CAMPOS_COM_COLUNA.has(campo)) continue;` manteria o
  // teste verde e mandaria para `dadosProduto` exatamente os campos que o Set
  // existe para manter fora. A linha inteira é o que vale vigiar.
  assert.match(fonteDoMotor(), /if \(CAMPOS_COM_COLUNA\.has\(campo\)\) continue;/);
});

test("os obrigatórios são os que montarRegistro recusa quando faltam", () => {
  // CHAMA o motor em vez de procurar a frase no fonte. Grep passaria verde se
  // alguém tirasse a recusa e deixasse a mensagem viva num comentário — guarda
  // que só lê texto dá a sensação de proteção sem a proteção.
  for (const campo of CAMPOS_OBRIGATORIOS) {
    const semEle = linhaCompleta();
    delete semEle.campos[campo];
    const r = montarRegistro(semEle, "Porto Seguro", undefined, new Date("2026-08-01"));
    assert.equal(r.ok, false, `montarRegistro aceitou linha sem ${campo}`);
  }

  // E o contrário: com todos presentes, a linha passa. Sem isto o teste acima
  // passaria mesmo se `montarRegistro` recusasse tudo.
  const completa = montarRegistro(linhaCompleta(), "Porto Seguro", undefined, new Date("2026-08-01"));
  assert.equal(completa.ok, true, `a linha completa devia passar`);
});

/** Uma linha aplicada válida, no formato que `montarRegistro` espera. */
function linhaCompleta(): {
  numero: number;
  origem: "deterministica";
  campos: Record<string, unknown>;
  pendentes: Record<string, string>;
  erros: string[];
} {
  return {
    numero: 7,
    origem: "deterministica",
    campos: {
      cpfCnpj: "12345678901",
      tipoProduto: "vida",
      numeroContrato: "AP-1",
      status: "ativo",
      inicioVigencia: new Date("2026-01-10"),
    },
    pendentes: {},
    erros: [],
  };
}

test("parceiro e dataReferencia não são obrigatórios na tela, e há motivo", () => {
  // `montarRegistro` também recusa por eles, mas os dois têm fallback fora da
  // planilha: `parceiroPadrao` e a competência do lote. Marcá-los obrigatórios
  // aqui obrigaria a mapear coluna que o arquivo pode não ter.
  assert.ok(!CAMPOS_OBRIGATORIOS.includes("parceiro"));
  assert.ok(!CAMPOS_OBRIGATORIOS.includes("dataReferencia"));
  assert.match(fonteDoMotor(), /texto\(c\.parceiro\) \?\? parceiroPadrao/);
  assert.match(fonteDoMotor(), /data\(c\.dataReferencia\) \?\? dataReferenciaDoLote/);
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
