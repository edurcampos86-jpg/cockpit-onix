/**
 * Testes da aplicação do perfil — sem banco.
 *
 * O tema do arquivo é um só: rótulo desconhecido vira PENDENTE, nunca palpite.
 * Cada teste abaixo é uma forma diferente de tentar arrancar um chute do
 * módulo — por semelhança, por prefixo, por acento, por "só falta o final".
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { agruparNaoMapeados, aplicarPerfil } from "./aplicar-perfil.ts";
import type { LinhaExtraida } from "./extracao.ts";
import type { PerfilImportacaoConfig } from "./perfil.ts";

const PERFIL: PerfilImportacaoConfig = {
  formato: "csv",
  extracao: { tipo: "csv", delimitador: ";" },
  mapeamentoColunas: {
    "CPF/CNPJ": "cpfCnpj",
    "Ramo": "tipoProduto",
    "Situação": "status",
    "Prêmio": "premio",
    "Início": "inicioVigencia",
  },
  formatosValor: {
    cpfCnpj: "documento_digitos",
    premio: "decimal_ptbr",
    inicioVigencia: "data_ddmmaaaa",
  },
  dicionarios: {
    tipoProduto: { "SEGURO DE VIDA": "vida", "AUTO FÁCIL": "auto_residencial" },
    status: { "EM VIGOR": "ativo", "CANCELADA": "cancelado" },
  },
};

function linha(celulas: Record<string, string>, numero = 2): LinhaExtraida {
  return { numero, celulas, origem: "deterministica" };
}

const COMPLETA = {
  "CPF/CNPJ": "097.146.005-10",
  Ramo: "SEGURO DE VIDA",
  "Situação": "EM VIGOR",
  "Prêmio": "1.234,56",
  "Início": "01/09/2026",
};

test("o caminho feliz: mapeia, tipa e canoniza", () => {
  const [r] = aplicarPerfil([linha(COMPLETA)], PERFIL);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.pendentes, {});
  assert.equal(r.campos.cpfCnpj, "09714600510");
  assert.equal(r.campos.tipoProduto, "vida");
  assert.equal(r.campos.status, "ativo");
  assert.equal(r.campos.premio, 1234.56);
  assert.equal((r.campos.inicioVigencia as Date).toISOString().slice(0, 10), "2026-09-01");
  assert.equal(r.origem, "deterministica");
});

test("o dicionário ignora acento, caixa e pontuação — mas não inventa", () => {
  const [r] = aplicarPerfil([linha({ ...COMPLETA, Ramo: "auto facil" })], PERFIL);
  assert.equal(r.campos.tipoProduto, "auto_residencial");
});

// ── O ponto do arquivo: nada de chute ────────────────────────────────────

test("rótulo desconhecido vira PENDENTE, e o valor NÃO entra em campos", () => {
  const [r] = aplicarPerfil([linha({ ...COMPLETA, Ramo: "SEGURO VIAGEM" })], PERFIL);
  assert.equal(r.pendentes.tipoProduto, "SEGURO VIAGEM");
  assert.equal(r.campos.tipoProduto, undefined, "campo pendente não pode ter valor");
  assert.deepEqual(r.erros, [], "pendente não é erro de leitura — é falta de mapeamento");
});

test("rótulo QUASE igual ao mapeado continua pendente", () => {
  // A tentação literal: "AUTO FÁCIL 3.0" parece muito com "AUTO FÁCIL". Se um
  // dia alguém acrescentar distância de edição aqui, é este teste que cai.
  for (const quase of ["AUTO FÁCIL 3.0", "SEGURO DE VIDA EM GRUPO", "EM VIGORR", "VIGOR"]) {
    const campo = quase.includes("VIGOR") ? "status" : "tipoProduto";
    const coluna = campo === "status" ? "Situação" : "Ramo";
    const [r] = aplicarPerfil([linha({ ...COMPLETA, [coluna]: quase })], PERFIL);
    assert.equal(
      r.pendentes[campo],
      quase,
      `${JSON.stringify(quase)} foi encaixado em ${JSON.stringify(r.campos[campo])}`,
    );
  }
});

test("campo com dicionário e célula vazia é null, não pendente", () => {
  // Ausência de dado é diferente de vocabulário desconhecido: a primeira não
  // se resolve editando o dicionário, e misturar as duas encheria o relatório
  // de trabalho que não existe.
  const [r] = aplicarPerfil([linha({ ...COMPLETA, Ramo: "" })], PERFIL);
  assert.equal(r.campos.tipoProduto, null);
  assert.equal(r.pendentes.tipoProduto, undefined);
});

test("valor que não casa com o formato vira ERRO com o motivo", () => {
  const [r] = aplicarPerfil([linha({ ...COMPLETA, "CPF/CNPJ": "123" })], PERFIL);
  assert.ok(r.erros.some((e) => /cpfCnpj: documento com 3 dígitos/.test(e)), r.erros.join(" | "));
});

test("coluna declarada e ausente no arquivo é erro, não silêncio", () => {
  const semRamo: Record<string, string> = { ...COMPLETA };
  delete semRamo.Ramo;
  const [r] = aplicarPerfil([linha(semRamo)], PERFIL);
  assert.ok(r.erros.some((e) => /"Ramo" não existe no arquivo/.test(e)), r.erros.join(" | "));
});

// ── O entregável: a lista de trabalho agrupada ───────────────────────────

test("os pendentes voltam agrupados por rótulo, com contagem de linhas", () => {
  const linhas = [
    linha({ ...COMPLETA, Ramo: "SEGURO VIAGEM" }, 2),
    linha({ ...COMPLETA, Ramo: "seguro viagem" }, 3),
    linha({ ...COMPLETA, Ramo: "SEGURO  VIAGEM " }, 4),
    linha({ ...COMPLETA, Ramo: "PREVIDÊNCIA" }, 5),
    linha({ ...COMPLETA, "Situação": "SINISTRADA" }, 6),
  ];
  const grupos = agruparNaoMapeados(aplicarPerfil(linhas, PERFIL));

  const viagem = grupos.find((g) => /viagem/i.test(g.rotulo));
  assert.equal(viagem?.linhas, 3, "as três grafias de 'seguro viagem' são UM trabalho, não três");
  assert.deepEqual(viagem?.exemplos, [2, 3, 4]);
  assert.equal(grupos[0].linhas, 3, "o mais frequente vem primeiro — é por onde se começa");
  assert.equal(grupos.length, 3);
  assert.ok(grupos.some((g) => g.campo === "status" && g.rotulo === "SINISTRADA"));
});

test("sem pendente, a lista é vazia", () => {
  assert.deepEqual(agruparNaoMapeados(aplicarPerfil([linha(COMPLETA)], PERFIL)), []);
});
