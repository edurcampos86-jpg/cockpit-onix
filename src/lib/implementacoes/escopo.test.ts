import { test } from "node:test";
import assert from "node:assert/strict";
import { filtroDaMetrica, filtroDeDono, podeAbrir, type QuemOlha } from "./escopo";

const ADMIN: QuemOlha = { userId: "u-admin", ehAdmin: true };
const ANA: QuemOlha = { userId: "u-ana", ehAdmin: false };
const BRUNO: QuemOlha = { userId: "u-bruno", ehAdmin: false };

test("admin não ganha cláusula nenhuma — vê a fila inteira", () => {
  assert.equal(filtroDeDono(ADMIN), undefined);
  // Espalhado num `where`, `undefined` não acrescenta nada.
  assert.deepEqual({ ...filtroDeDono(ADMIN) }, {});
});

test("quem não é admin é recortado pelo próprio id", () => {
  assert.deepEqual(filtroDeDono(ANA), { userId: "u-ana" });
  assert.deepEqual({ ...filtroDeDono(ANA), score: null }, { userId: "u-ana", score: null });
});

test("o recorte usa o id de QUEM OLHA, nunca um id vindo de fora", () => {
  // A régua não aceita "de quem eu quero ver": só existe o próprio id.
  assert.notDeepEqual(filtroDeDono(ANA), filtroDeDono(BRUNO));
});

test("item único: cada um abre o seu; admin abre todos", () => {
  assert.equal(podeAbrir(ANA, "u-ana"), true);
  assert.equal(podeAbrir(ANA, "u-bruno"), false);
  assert.equal(podeAbrir(BRUNO, "u-ana"), false);
  assert.equal(podeAbrir(ADMIN, "u-ana"), true);
  assert.equal(podeAbrir(ADMIN, "u-bruno"), true);
});

test("dono vazio ou desconhecido não abre para não-admin", () => {
  // Linha antiga sem autor, ou id que não casa com ninguém: o lado seguro é
  // recusar. Admin continua alcançando, que é quem pode consertar o cadastro.
  assert.equal(podeAbrir(ANA, ""), false);
  assert.equal(podeAbrir(ADMIN, ""), true);
});

test("a métrica usa o MESMO recorte da listagem", () => {
  // O ponto que mais parece inofensivo: "quantas viraram entrega" sobre a fila
  // inteira conta sugestões de outras pessoas sem mostrar nenhuma linha.
  // Amarrar as duas funções aqui impede que uma mude sem a outra.
  assert.deepEqual(filtroDaMetrica(ANA), filtroDeDono(ANA));
  assert.equal(filtroDaMetrica(ADMIN), filtroDeDono(ADMIN));
});

test("os seis pontos de leitura cabem em duas primitivas, e nenhuma delas é 'abrir tudo'", () => {
  // Guarda de intenção: se alguém acrescentar uma terceira primitiva que
  // devolva sempre `undefined`, este teste não pega — mas a leitura de que
  // SÓ existem duas formas de recortar fica escrita.
  const paraLista = filtroDeDono(ANA);
  assert.ok(paraLista && paraLista.userId === "u-ana");
  assert.equal(podeAbrir(ANA, "u-bruno"), false);
});
