import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIMITE_CORPO,
  chavesFaltantes,
  limparSegredos,
  mascararTelefone,
  truncarCorpo,
} from "./zapi-diagnostico";

/* ── limparSegredos: a razão de ser do módulo ───────────────────────── */

test("a URL da Z-API dentro da mensagem de erro sai sem instância nem token", () => {
  // Formato real de erro de rede do Node: a URL inteira entra na mensagem, e
  // ela carrega instância e token no caminho.
  const cru =
    "request to https://api.z-api.io/instances/3ABCDEF/token/F9ce8a1b2c3d/send-text failed";
  const limpo = limparSegredos(cru, ["F9ce8a1b2c3d", "3ABCDEF"]);
  assert.ok(!limpo.includes("F9ce8a1b2c3d"), "token vazou");
  assert.ok(!limpo.includes("3ABCDEF"), "instância vazou");
  assert.ok(limpo.includes("<omitido>"));
  assert.ok(limpo.includes("api.z-api.io"), "o host some junto, e ele é útil");
});

test("o mesmo segredo é limpo em todas as ocorrências", () => {
  const limpo = limparSegredos("tok=SEGREDO123 e de novo SEGREDO123", ["SEGREDO123"]);
  assert.equal(limpo, "tok=<omitido> e de novo <omitido>");
});

test("segredo indefinido, vazio ou curto demais não destrói o texto", () => {
  // `split("")` quebraria caractere a caractere. E um "segredo" de 1 a 3 chars
  // casaria dentro de qualquer palavra, apagando o log inteiro.
  const texto = "HTTP 401 Unauthorized";
  assert.equal(limparSegredos(texto, [undefined]), texto);
  assert.equal(limparSegredos(texto, [""]), texto);
  assert.equal(limparSegredos(texto, ["a"]), texto);
  assert.equal(limparSegredos(texto, ["ttp"]), texto);
});

test("segredo com caractere de regex é tratado como texto literal", () => {
  // Compilar isto como padrão daria match errado ou lançaria.
  const limpo = limparSegredos("erro em a.b+c$d", ["a.b+c$d"]);
  assert.equal(limpo, "erro em <omitido>");
  assert.equal(limparSegredos("axbxcxd", ["a.b+c$d"]), "axbxcxd", "não virou regex");
});

/* ── mascararTelefone ───────────────────────────────────────────────── */

test("telefone aparece só pelos quatro últimos dígitos", () => {
  assert.equal(mascararTelefone("5571997359025"), "…9025");
  assert.equal(mascararTelefone("5511988887777"), "…7777");
});

test("telefone curto ou vazio não vaza nada", () => {
  assert.equal(mascararTelefone(""), "<vazio>");
  assert.equal(mascararTelefone("12"), "**");
  assert.equal(mascararTelefone("1234"), "****");
  assert.equal(mascararTelefone("12345"), "…2345");
});

test("nenhum número completo sobrevive ao mascaramento", () => {
  const numero = "5571997359025";
  assert.ok(!mascararTelefone(numero).includes(numero));
});

/* ── chavesFaltantes ────────────────────────────────────────────────── */

test("aponta as duas chaves de instância pelo nome", () => {
  assert.deepEqual(
    chavesFaltantes({ temToken: false, temInstancia: false, temTelefone: true, usouOverride: false }),
    ["DATACRAZY_INSTANCE_TOKEN", "DATACRAZY_ALERTS_INSTANCE"],
  );
});

test("telefone vazio SEM override acusa a variável de ambiente", () => {
  assert.deepEqual(
    chavesFaltantes({ temToken: true, temInstancia: true, temTelefone: false, usouOverride: false }),
    ["DATACRAZY_ALERTS_PHONE"],
  );
});

test("telefone vazio COM override NÃO acusa a variável de ambiente", () => {
  // É o caso dos alertas de cadência 12-4-2, que mandam o telefone do assessor.
  // A chave pode estar perfeita; quem veio malformado foi o destinatário.
  const faltando = chavesFaltantes({
    temToken: true, temInstancia: true, temTelefone: false, usouOverride: true,
  });
  assert.equal(faltando.length, 1);
  assert.ok(!faltando[0].includes("DATACRAZY_ALERTS_PHONE"), "mandaria conferir a env errada");
  assert.match(faltando[0], /destinat/);
});

test("nada faltando devolve lista vazia", () => {
  assert.deepEqual(
    chavesFaltantes({ temToken: true, temInstancia: true, temTelefone: true, usouOverride: false }),
    [],
  );
});

/* ── truncarCorpo ───────────────────────────────────────────────────── */

test("corpo longo é cortado no limite e marcado", () => {
  const corpo = truncarCorpo("x".repeat(LIMITE_CORPO + 200));
  assert.ok(corpo.endsWith("… <cortado>"));
  assert.ok(corpo.length < LIMITE_CORPO + 20);
});

test("corpo no limite exato não é marcado", () => {
  const corpo = truncarCorpo("y".repeat(LIMITE_CORPO));
  assert.ok(!corpo.includes("<cortado>"));
});

test("corpo vazio ou só espaços é dito, não some", () => {
  assert.equal(truncarCorpo(""), "<corpo vazio>");
  assert.equal(truncarCorpo("   \n  "), "<corpo vazio>");
});

test("quebras de linha colapsam para caber numa linha de log", () => {
  assert.equal(truncarCorpo('{\n  "error": "x"\n}'), '{ "error": "x" }');
});
