/**
 * Testes de extração determinística e da regra de despacho — sem banco e sem
 * nenhuma chamada de rede.
 *
 * O teste que mais importa é o primeiro: Excel e CSV NUNCA passam por IA. Ele
 * não confere um comentário — confere o `switch` que decide.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

import { FORMATOS_DETERMINISTICOS, FORMATOS_IA, extrair, usaIa } from "./extracao.ts";
import { detectarDelimitador, extrairPlanilha, lerCsv } from "./extracao-planilha.ts";
import type { PerfilImportacaoConfig } from "./perfil.ts";

// ── A regra travada: planilha nunca vai para o modelo ────────────────────

test("Excel e CSV são determinísticos; PDF e Word são os únicos que usam IA", () => {
  assert.deepEqual([...FORMATOS_DETERMINISTICOS], ["xlsx", "csv"]);
  assert.deepEqual([...FORMATOS_IA], ["pdf", "docx"]);
  assert.equal(usaIa("xlsx"), false);
  assert.equal(usaIa("csv"), false);
  assert.equal(usaIa("pdf"), true);
  assert.equal(usaIa("docx"), true);
});

test("nenhum formato pode estar nas duas listas", () => {
  for (const f of FORMATOS_DETERMINISTICOS) {
    assert.ok(!FORMATOS_IA.includes(f), `${f} está nas duas listas`);
  }
});

test("o despacho de xlsx/csv não menciona o módulo de IA", () => {
  // A régua aplicada ao CÓDIGO, não à disciplina de quem edita: se um dia
  // alguém rotear planilha para `extracao-ia`, este teste cai.
  const fonte = readFileSync(join(process.cwd(), "src", "lib", "importacao", "extracao.ts"), "utf8");
  const despacho = fonte.slice(fonte.indexOf('case "xlsx":'), fonte.indexOf('case "pdf":'));
  assert.ok(!despacho.includes("extracao-ia"), "o ramo de planilha carrega o módulo de IA");
  assert.ok(despacho.includes("extracao-planilha"), "o ramo de planilha perdeu o parser");
});

test("extrair recusa formato fora dos quatro", async () => {
  await assert.rejects(
    () =>
      extrair(
        { nome: "x.ods", conteudo: Buffer.from("") },
        { formato: "ods", extracao: { tipo: "ods" }, mapeamentoColunas: {}, formatosValor: {}, dicionarios: {} } as unknown as PerfilImportacaoConfig,
      ),
    /não suportado/,
  );
});

// ── CSV ──────────────────────────────────────────────────────────────────

test("lerCsv trata aspas, aspas escapadas e delimitador dentro do campo", () => {
  const linhas = lerCsv('a;b\n"x;y";"diz ""oi"""\n', ";");
  assert.deepEqual(linhas, [
    ["a", "b"],
    ["x;y", 'diz "oi"'],
  ]);
});

test("lerCsv trata CRLF e quebra de linha dentro de campo com aspas", () => {
  const linhas = lerCsv('a,b\r\n"linha\ncontinua",2\r\n', ",");
  assert.deepEqual(linhas, [
    ["a", "b"],
    ["linha\ncontinua", "2"],
  ]);
});

test("detectarDelimitador prefere ; quando ele aparece — o caso pt-BR", () => {
  // Ler com vírgula uma planilha pt-BR partiria "1.234,56" em duas colunas e
  // deslocaria a linha inteira.
  assert.equal(detectarDelimitador('CPF;Valor\n1;"1.234,56"'), ";");
  assert.equal(detectarDelimitador("CPF,Valor\n1,2"), ",");
});

const PERFIL_CSV: PerfilImportacaoConfig = {
  formato: "csv",
  extracao: { tipo: "csv", delimitador: ";", linhaCabecalho: 1 },
  mapeamentoColunas: { "CPF/CNPJ": "cpfCnpj", "Prêmio": "premio" },
  formatosValor: { cpfCnpj: "documento_digitos", premio: "decimal_ptbr" },
  dicionarios: {},
};

test("CSV vira linhas numeradas pela posição real no arquivo", () => {
  const csv = "CPF/CNPJ;Prêmio\n097.146.005-10;1.234,56\n12.345.678/0001-95;90,00\n";
  const r = extrairPlanilha({ nome: "base.csv", conteudo: Buffer.from(csv, "utf8") }, PERFIL_CSV);
  assert.equal(r.custo, null, "extração determinística não tem custo");
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].numero, 2, "a primeira linha de dado é a 2 — o cabeçalho é a 1");
  assert.equal(r.linhas[0].origem, "deterministica");
  assert.equal(r.linhas[0].celulas["CPF/CNPJ"], "097.146.005-10");
  assert.equal(r.linhas[1].celulas["Prêmio"], "90,00");
});

test("linha inteiramente vazia é rodapé, não dado", () => {
  const csv = "CPF/CNPJ;Prêmio\n097.146.005-10;1,00\n;\n\n";
  const r = extrairPlanilha({ nome: "base.csv", conteudo: Buffer.from(csv, "utf8") }, PERFIL_CSV);
  assert.equal(r.linhas.length, 1);
});

test("cabeçalho declarado além do fim do arquivo falha com o número na mensagem", () => {
  assert.throws(
    () =>
      extrairPlanilha(
        { nome: "curto.csv", conteudo: Buffer.from("a;b\n") },
        { ...PERFIL_CSV, extracao: { tipo: "csv", delimitador: ";", linhaCabecalho: 9 } },
      ),
    /linha de cabeçalho 9 não existe/,
  );
});

// ── Excel ────────────────────────────────────────────────────────────────

function planilha(aba: string, grade: unknown[][]): Buffer {
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(grade), aba);
  return XLSX.write(livro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("Excel lê a aba e a linha de cabeçalho declaradas no perfil", () => {
  const conteudo = planilha("Apólices", [
    ["Relatório mensal", "", ""],
    ["", "", ""],
    ["CPF/CNPJ", "Apólice", "Prêmio"],
    ["097.146.005-10", "AP-1", "1.234,56"],
  ]);
  const r = extrairPlanilha(
    { nome: "porto.xlsx", conteudo },
    {
      formato: "xlsx",
      extracao: { tipo: "xlsx", aba: "Apólices", linhaCabecalho: 3 },
      mapeamentoColunas: { "CPF/CNPJ": "cpfCnpj", "Apólice": "numeroContrato" },
      formatosValor: { cpfCnpj: "documento_digitos" },
      dicionarios: {},
    },
  );
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].numero, 4);
  assert.equal(r.linhas[0].celulas["Apólice"], "AP-1");
  assert.equal(r.custo, null);
});

test("aba inexistente falha dizendo quais existem", () => {
  assert.throws(
    () =>
      extrairPlanilha(
        { nome: "x.xlsx", conteudo: planilha("Carteira", [["a"]]) },
        {
          formato: "xlsx",
          extracao: { tipo: "xlsx", aba: "Apólices" },
          mapeamentoColunas: { a: "campo" },
          formatosValor: {},
          dicionarios: {},
        },
      ),
    /não existe — o arquivo tem: Carteira/,
  );
});

test("cabeçalho com rótulo repetido vira aviso, não silêncio", () => {
  const r = extrairPlanilha(
    { nome: "x.xlsx", conteudo: planilha("P", [["Valor", "Valor"], ["1", "2"]]) },
    {
      formato: "xlsx",
      extracao: { tipo: "xlsx" },
      mapeamentoColunas: { Valor: "premio" },
      formatosValor: {},
      dicionarios: {},
    },
  );
  assert.ok(r.avisos.some((a) => /rótulo repetido/.test(a)), r.avisos.join(" | "));
});

// ── Word: a descompactação, que é determinística ─────────────────────────

test("textoDoDocx recupera a tabela com uma LINHA por linha, não por célula", async () => {
  // Sem a regra de ordem no `replace`, cada célula viraria uma linha e uma
  // tabela de 3×2 chegaria ao modelo como 6 linhas soltas, sem estrutura.
  const { default: AdmZip } = await import("adm-zip");
  const { textoDoDocx } = await import("./extracao-ia.ts");

  const celula = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
  const linha = (l: string[]) => `<w:tr>${l.map(celula).join("")}</w:tr>`;
  const xml =
    '<w:document xmlns:w="x"><w:body><w:tbl>' +
    [["CPF", "Ramo", "Prêmio"], ["09714600510", "VIDA", "1.234,56"]].map(linha).join("") +
    "</w:tbl></w:body></w:document>";
  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(xml, "utf8"));

  const texto = textoDoDocx(zip.toBuffer());
  const linhas = texto.split("\n").filter((l) => l.trim());
  assert.equal(linhas.length, 2);
  assert.deepEqual(linhas[1].split("\t").filter(Boolean), ["09714600510", "VIDA", "1.234,56"]);
});

test("zip sem word/document.xml não é Word, e diz isso", async () => {
  const { default: AdmZip } = await import("adm-zip");
  const { textoDoDocx } = await import("./extracao-ia.ts");
  const zip = new AdmZip();
  zip.addFile("qualquer.txt", Buffer.from("oi"));
  assert.throws(() => textoDoDocx(zip.toBuffer()), /não parece um Word/);
});

test("calcularCusto usa a tabela de preço e não chuta modelo desconhecido", async () => {
  const { calcularCusto } = await import("./extracao-ia.ts");
  // Opus 5: US$ 5 por 1M de entrada, US$ 25 por 1M de saída.
  const c = calcularCusto("claude-opus-5", 1_000_000, 100_000);
  assert.equal(c.usd, 7.5);
  // Modelo fora da tabela custa 0 DECLARADO — número inventado num relatório de
  // custo é pior que número ausente.
  assert.equal(calcularCusto("modelo-que-nao-existe", 1_000_000, 1_000_000).usd, 0);
});

test("o schema de saída da IA só admite os rótulos do perfil", async () => {
  const { schemaDeSaida } = await import("./extracao-ia.ts");
  const schema = schemaDeSaida({
    formato: "pdf",
    extracao: { tipo: "pdf", estrategia: "tabela" },
    mapeamentoColunas: { "CPF/CNPJ": "cpfCnpj", "Apólice": "numeroContrato" },
    formatosValor: {},
    dicionarios: {},
  });
  const itens = (schema as { properties: { linhas: { items: Record<string, unknown> } } }).properties
    .linhas.items;
  assert.deepEqual(Object.keys(itens.properties as object), ["CPF/CNPJ", "Apólice"]);
  assert.equal(itens.additionalProperties, false, "o modelo poderia inventar coluna");
});
