import { test } from "node:test";
import assert from "node:assert/strict";
import { anonimizar, auditarVazamento } from "./anonimizar";

const DENY = ["Marcelo Ferreira Lima", "Ana Paula Souza"];
const op = { denylist: DENY };

test("redige CPF, e-mail e telefone", () => {
  const r = anonimizar("meu cpf é 123.456.789-00, email joao@teste.com.br, zap 11 98765-4321", op);
  assert.ok(!r.texto.includes("123.456.789-00"));
  assert.ok(!r.texto.includes("joao@teste.com.br"));
  assert.ok(r.texto.includes("[documento]"));
  assert.ok(r.texto.includes("[email]"));
  assert.ok(r.texto.includes("[telefone]"));
});

test("redige valores em número e por extenso", () => {
  for (const entrada of [
    "ele tem R$ 1.200.000,00 na conta",
    "são 2 milhões investidos",
    "duzentos mil reais por ano",
    "R$ 500 mil de cobertura",
  ]) {
    const r = anonimizar(entrada, op);
    assert.ok(r.texto.includes("[valor]"), `não redigiu: ${entrada} -> ${r.texto}`);
    assert.ok(!/\d{3}/.test(r.texto), `sobrou número: ${r.texto}`);
  }
});

test("redige a oração inteira quando há termo de saúde", () => {
  const r = anonimizar("ele fez uma cirurgia ano passado, então a gente aguardou.", op);
  assert.ok(!/cirurgia/i.test(r.texto));
  assert.ok(r.texto.includes("[situação de saúde]"));
  assert.ok(/aguardou/.test(r.texto), "não devia apagar a oração seguinte");
});

test("nome da denylist vira [cliente], mesmo só o primeiro nome", () => {
  const r = anonimizar("falei com o Marcelo ontem e a Ana Paula confirmou", op);
  assert.ok(!/Marcelo/i.test(r.texto));
  assert.ok(!/Ana/.test(r.texto));
  assert.ok(r.texto.includes("[cliente]"));
});

test("preserva as categorias de produto que o guia precisa descrever", () => {
  const r = anonimizar(
    "o seguro de vida não é despesa, e a previdência entra depois; consórcio é outra coisa",
    op,
  );
  assert.match(r.texto, /seguro de vida/);
  assert.match(r.texto, /previd[êe]ncia/);
  assert.match(r.texto, /cons[óo]rcio/);
});

test("preserva a voz do Eduardo — não redige o vocabulário comum dele", () => {
  const fala = "olha, deixa eu te mostrar uma coisa: faz a conta comigo, é a mesma coisa que a casa";
  const r = anonimizar(fala, op);
  assert.equal(r.texto, fala);
});

test("marca de seguradora/banco vira [instituição]", () => {
  const r = anonimizar("a Prudential cobra mais que o Bradesco nesse caso", op);
  assert.ok(!/Prudential|Bradesco/i.test(r.texto));
  assert.ok(r.texto.includes("[instituição]"));
});

test("é idempotente — a segunda passada não altera nada", () => {
  const fala = "o Marcelo tem R$ 300.000,00 e fez cirurgia; email dele é x@y.com";
  const um = anonimizar(fala, op).texto;
  const dois = anonimizar(um, op).texto;
  assert.equal(dois, um);
});

test("heurística pega nome próprio fora da denylist", () => {
  const r = anonimizar("conversei com o Reginaldo semana passada", op);
  assert.ok(!/Reginaldo/.test(r.texto), r.texto);
});

test("auditarVazamento acusa o que escapou e cala quando está limpo", () => {
  assert.ok(auditarVazamento("valor de R$ 40.000 e cpf 111.222.333-44").length >= 2);
  assert.equal(auditarVazamento("o [cliente] tinha [valor] guardado").length, 0);
});
