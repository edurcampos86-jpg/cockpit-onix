/**
 * Testes do perfil de importação — sem banco.
 *
 * O teste que mais importa aqui é o de GENERALIDADE, no fim do arquivo: o
 * mesmo perfil precisa servir a Imobiliária sem mudança de schema. Se ele
 * quebrar, o desenho está errado e a migration não deveria ter sido escrita.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FORMATOS_ARQUIVO,
  FORMATOS_VALOR,
  ehFormatoArquivo,
  ehFormatoValor,
  validarPerfil,
  type PerfilImportacaoConfig,
} from "./perfil.ts";

// ── Vocabulário fechado ──────────────────────────────────────────────────

test("os quatro formatos de arquivo do enunciado estão cobertos", () => {
  assert.deepEqual([...FORMATOS_ARQUIVO], ["xlsx", "csv", "pdf", "docx"]);
});

test("decimal e data têm as duas convenções, que é o ponto", () => {
  // Ler "1.234,56" como ISO dá 1.234 — erro de três ordens de grandeza num
  // campo de dinheiro, sem exceção nenhuma no caminho.
  for (const f of ["decimal_ptbr", "decimal_iso", "data_ddmmaaaa", "data_iso"]) {
    assert.ok((FORMATOS_VALOR as readonly string[]).includes(f), `faltou ${f}`);
  }
});

test("ehFormatoArquivo e ehFormatoValor recusam o resto", () => {
  assert.equal(ehFormatoArquivo("xlsx"), true);
  assert.equal(ehFormatoArquivo("XLSX"), false);
  assert.equal(ehFormatoArquivo("ods"), false);
  assert.equal(ehFormatoValor("decimal_ptbr"), true);
  assert.equal(ehFormatoValor("decimal"), false);
});

// ── Perfil de referência: Corretora, Excel ───────────────────────────────

const PORTO_XLSX: PerfilImportacaoConfig = {
  formato: "xlsx",
  extracao: { tipo: "xlsx", aba: "Apólices", linhaCabecalho: 3 },
  mapeamentoColunas: {
    "CPF/CNPJ": "cpfCnpj",
    "Apólice": "numeroContrato",
    "Ramo": "tipoProduto",
    "Início Vigência": "inicioVigencia",
    "Fim Vigência": "fimVigencia",
    "Situação": "status",
    "Prêmio Líquido": "premio",
  },
  formatosValor: {
    cpfCnpj: "documento_digitos",
    premio: "decimal_ptbr",
    inicioVigencia: "data_ddmmaaaa",
    fimVigencia: "data_ddmmaaaa",
  },
  dicionarios: {
    tipoProduto: { "SEGURO DE VIDA": "vida", "AUTO FÁCIL": "auto_residencial" },
    status: { "EM VIGOR": "ativo", "CANCELADA": "cancelado" },
  },
};

test("o perfil de referência é válido", () => {
  assert.deepEqual(validarPerfil(PORTO_XLSX), []);
});

// ── O que a validação pega ───────────────────────────────────────────────

test("extracao de tipo diferente do formato é erro", () => {
  const erros = validarPerfil({
    ...PORTO_XLSX,
    formato: "csv",
    // extracao continua xlsx — o descuido clássico de duplicar um perfil
  });
  assert.ok(erros.some((e) => /não bate com formato/.test(e)), erros.join(" | "));
});

test("duas colunas apontando para o mesmo destino é erro", () => {
  // Sem esta checagem a segunda sobrescreveria a primeira em silêncio, e o
  // dado perdido seria o da esquerda da planilha.
  const erros = validarPerfil({
    ...PORTO_XLSX,
    mapeamentoColunas: { "Prêmio Líquido": "premio", "Prêmio Bruto": "premio" },
    formatosValor: { premio: "decimal_ptbr" },
    dicionarios: {},
  });
  assert.ok(erros.some((e) => /duas colunas apontam para "premio"/.test(e)), erros.join(" | "));
});

test("formatoValor ou dicionário para campo que não existe é erro", () => {
  // Rename feito de um lado só: o sintoma seria o valor chegar como texto cru,
  // sem erro nenhum.
  const erros = validarPerfil({ ...PORTO_XLSX, formatosValor: { premioo: "decimal_ptbr" } });
  assert.ok(erros.some((e) => /formatosValor declara "premioo"/.test(e)), erros.join(" | "));

  const erros2 = validarPerfil({ ...PORTO_XLSX, dicionarios: { produto: { a: "b" } } });
  assert.ok(erros2.some((e) => /dicionarios declara "produto"/.test(e)), erros2.join(" | "));
});

test("mapeamento vazio é erro", () => {
  const erros = validarPerfil({
    ...PORTO_XLSX,
    mapeamentoColunas: {},
    formatosValor: {},
    dicionarios: {},
  });
  assert.ok(erros.some((e) => /mapeamentoColunas vazio/.test(e)));
});

test("todos os problemas voltam de uma vez, não só o primeiro", () => {
  const erros = validarPerfil({
    ...PORTO_XLSX,
    formato: "csv",
    formatosValor: { inexistente: "decimal_ptbr" },
  });
  assert.ok(erros.length >= 2, `esperava vários erros, veio ${erros.length}`);
});

// ── PDF e Word cabem na MESMA forma ──────────────────────────────────────

test("PDF por regex usa o nome do padrão como rótulo de origem", () => {
  const pdf: PerfilImportacaoConfig = {
    formato: "pdf",
    extracao: {
      tipo: "pdf",
      estrategia: "regex",
      padroes: { "Apólice": "Ap[oó]lice n[ºo]\\s*(\\d+)", "CPF": "CPF:\\s*([\\d.\\-/]+)" },
    },
    mapeamentoColunas: { "Apólice": "numeroContrato", "CPF": "cpfCnpj" },
    formatosValor: { cpfCnpj: "documento_digitos" },
    dicionarios: {},
  };
  assert.deepEqual(validarPerfil(pdf), []);
});

test("padrão de PDF sem entrada no mapeamento é erro", () => {
  const pdf: PerfilImportacaoConfig = {
    formato: "pdf",
    extracao: { tipo: "pdf", estrategia: "regex", padroes: { Orfao: "(\\d+)" } },
    mapeamentoColunas: { "CPF": "cpfCnpj" },
    formatosValor: {},
    dicionarios: {},
  };
  assert.ok(validarPerfil(pdf).some((e) => /"Orfao" sem entrada/.test(e)));
});

test("Word entra pela tabela, mesma forma", () => {
  const docx: PerfilImportacaoConfig = {
    formato: "docx",
    extracao: { tipo: "docx", indiceTabela: 0 },
    mapeamentoColunas: { "Contrato": "numeroContrato", "Documento": "cpfCnpj" },
    formatosValor: { cpfCnpj: "documento_digitos" },
    dicionarios: {},
  };
  assert.deepEqual(validarPerfil(docx), []);
});

// ── TESTE DE GENERALIDADE — o ativo de longo prazo ───────────────────────

test("o MESMO perfil mapeia uma planilha de imóveis da Imobiliária", () => {
  // Nada de seguro aqui: outra empresa, outro domínio, outro vocabulário — e
  // o mesmo model, sem uma linha de schema diferente. Se este teste precisasse
  // de campo novo, o desenho estaria errado e a migration não deveria existir.
  const imobiliaria: PerfilImportacaoConfig = {
    formato: "xlsx",
    extracao: { tipo: "xlsx", aba: "Carteira", linhaCabecalho: 1 },
    mapeamentoColunas: {
      "CPF do Proprietário": "cpfCnpj",
      "Código do Imóvel": "numeroContrato",
      "Endereço": "endereco",
      "Tipo": "tipoProduto",
      "Valor Locação": "valorLocacao",
      "Início Contrato": "inicioVigencia",
      "Situação": "status",
    },
    formatosValor: {
      cpfCnpj: "documento_digitos",
      valorLocacao: "decimal_ptbr",
      inicioVigencia: "data_ddmmaaaa",
    },
    dicionarios: {
      tipoProduto: { "APTO": "residencial", "SALA COMERCIAL": "comercial" },
      status: { "LOCADO": "ativo", "DISPONÍVEL": "encerrado" },
    },
  };

  assert.deepEqual(validarPerfil(imobiliaria), []);

  // E o mecanismo de validação continua valendo no domínio novo: os mesmos
  // erros são pegos, sem nenhuma regra específica de imóvel.
  const comDuplicata = validarPerfil({
    ...imobiliaria,
    mapeamentoColunas: { "Valor Locação": "valorLocacao", "Aluguel": "valorLocacao" },
    formatosValor: { valorLocacao: "decimal_ptbr" },
    dicionarios: {},
  });
  assert.ok(comDuplicata.some((e) => /duas colunas apontam para "valorLocacao"/.test(e)));
});

test("nenhum identificador do módulo nomeia seguro", () => {
  // A régua de generalidade, aplicada ao próprio arquivo em vez de confiada à
  // disciplina de quem edita. Vale sobre o CÓDIGO, não sobre os comentários:
  // a documentação precisa poder citar o caso de uso da Corretora.
  const fonte = readFileSync(join(process.cwd(), "src", "lib", "importacao", "perfil.ts"), "utf8");
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  for (const proibido of ["apolice", "apólice", "seguro", "premio", "prêmio", "seguradora"]) {
    assert.ok(
      !semComentarios.toLowerCase().includes(proibido),
      `"${proibido}" apareceu no CÓDIGO de perfil.ts — o módulo tem de servir a ` +
        "Imobiliária, Corporate e Tech sem falar de seguro.",
    );
  }
});

test("PDF sem estrategia é recusado — o objeto que a tela montava por analogia", () => {
  // `{ tipo: "pdf", linhaCabecalho: 1 }` é o que uma tela de criação monta
  // copiando o padrão de xlsx. O tipo `Extracao` não o admite, mas o tipo não
  // roda em runtime, e a validação deixava passar inteiro: `tipo` batia com
  // `formato` e o único bloco de PDF era o de regex, pulado.
  const erros = validarPerfil({
    formato: "pdf",
    extracao: { tipo: "pdf", linhaCabecalho: 1 } as unknown as PerfilImportacaoConfig["extracao"],
    mapeamentoColunas: { "Apólice": "numeroContrato" },
    formatosValor: {},
    dicionarios: {},
  });
  assert.ok(
    erros.some((e) => e.includes("estrategia")),
    `esperava recusa por estrategia ausente, veio: ${JSON.stringify(erros)}`,
  );
});

test("PDF com estrategia inventada também é recusado", () => {
  const erros = validarPerfil({
    formato: "pdf",
    extracao: { tipo: "pdf", estrategia: "ocr" } as unknown as PerfilImportacaoConfig["extracao"],
    mapeamentoColunas: { "Apólice": "numeroContrato" },
    formatosValor: {},
    dicionarios: {},
  });
  assert.ok(erros.some((e) => e.includes("estrategia")));
});

test("PDF por tabela continua válido", () => {
  assert.deepEqual(
    validarPerfil({
      formato: "pdf",
      extracao: { tipo: "pdf", estrategia: "tabela" },
      mapeamentoColunas: { "Apólice": "numeroContrato" },
      formatosValor: {},
      dicionarios: {},
    }),
    [],
  );
});

test("PDF por regex continua válido, e a regra dos padrões segue valendo", () => {
  assert.deepEqual(
    validarPerfil({
      formato: "pdf",
      extracao: { tipo: "pdf", estrategia: "regex", padroes: { "Apólice": "n. (\\d+)" } },
      mapeamentoColunas: { "Apólice": "numeroContrato" },
      formatosValor: {},
      dicionarios: {},
    }),
    [],
  );

  const orfao = validarPerfil({
    formato: "pdf",
    extracao: { tipo: "pdf", estrategia: "regex", padroes: { "Ramo": "Ramo: (\\w+)" } },
    mapeamentoColunas: { "Apólice": "numeroContrato" },
    formatosValor: {},
    dicionarios: {},
  });
  assert.ok(orfao.some((e) => e.includes("padroes")));
});

test("a trava é só de PDF — docx, xlsx e csv não ganham exigência nova", () => {
  for (const extracao of [
    { tipo: "docx", indiceTabela: 0 },
    { tipo: "xlsx", linhaCabecalho: 1 },
    { tipo: "csv", delimitador: ";" },
  ] as const) {
    assert.deepEqual(
      validarPerfil({
        formato: extracao.tipo,
        extracao,
        mapeamentoColunas: { "Apólice": "numeroContrato" },
        formatosValor: {},
        dicionarios: {},
      }),
      [],
      `${extracao.tipo} não devia ganhar exigência de estrategia`,
    );
  }
});
