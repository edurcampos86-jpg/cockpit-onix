/**
 * Testes da comparação PURA de `migrations-aplicadas.ts` — sem banco, sem disco.
 *
 * O que está travado aqui é o significado de `pendentes`: ele é a resposta à
 * pergunta "o app no ar espera schema que o banco não tem?". Se ele contar
 * errado, o `/api/health` fica verde exatamente no estado que ele existe para
 * denunciar.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { compararMigrations, type LinhaMigration } from "./migrations-aplicadas.ts";

const FIM = new Date("2026-08-12T10:00:00.000Z");

function aplicada(nome: string, fim = FIM): LinhaMigration {
  return { migration_name: nome, finished_at: fim, rolled_back_at: null };
}

const A = "20260101000000_a";
const B = "20260202000000_b";
const C = "20260303000000_c";

test("banco em dia: nada pendente, nada falho", () => {
  const r = compararMigrations([A, B], [aplicada(A), aplicada(B)]);
  assert.deepEqual(r.pendentes, []);
  assert.deepEqual(r.falhas, []);
  assert.equal(r.aplicadas, 2);
  assert.equal(r.ultima, B);
});

test("O CASO: código no ar espera migration que o banco não tem", () => {
  // É o estado que a separação entre migrate e start criou, e o motivo deste
  // módulo existir. O banco responde `SELECT 1`, o health ficaria verde, e a
  // falha apareceria como coluna inexistente no meio de uma requisição.
  const r = compararMigrations([A, B, C], [aplicada(A), aplicada(B)]);
  assert.deepEqual(r.pendentes, [C]);
  assert.equal(r.aplicadas, 2);
});

test("migration começada e não terminada é FALHA, não aplicada", () => {
  // `finished_at` nulo é a marca do `migrate deploy` interrompido no meio.
  // Contar como aplicada esconderia schema pela metade — o pior dos estados,
  // porque ninguém procura por ele.
  const meia: LinhaMigration = {
    migration_name: B,
    finished_at: null,
    rolled_back_at: null,
  };
  const r = compararMigrations([A, B], [aplicada(A), meia]);
  assert.deepEqual(r.falhas, [B]);
  assert.deepEqual(r.pendentes, [B], "não terminou ⇒ o banco não tem ⇒ pendente");
  assert.equal(r.aplicadas, 1);
});

test("migration revertida também não conta como aplicada", () => {
  const revertida: LinhaMigration = {
    migration_name: B,
    finished_at: FIM,
    rolled_back_at: new Date("2026-08-12T11:00:00.000Z"),
  };
  const r = compararMigrations([A, B], [aplicada(A), revertida]);
  assert.deepEqual(r.falhas, [B]);
  assert.deepEqual(r.pendentes, [B]);
});

test("a última vem por NOME, não por finished_at", () => {
  // Num restore de dump, todas as linhas voltam com a mesma marca de tempo.
  // O nome do Prisma começa com timestamp, então ordenar por nome é ordenar
  // por tempo — e sobrevive ao restore.
  const mesmoInstante = new Date("2026-08-12T10:00:00.000Z");
  const r = compararMigrations(
    [A, B, C],
    [aplicada(C, mesmoInstante), aplicada(A, mesmoInstante), aplicada(B, mesmoInstante)],
  );
  assert.equal(r.ultima, C);
});

test("banco novo, sem nenhuma migration: tudo pendente e ultima é null", () => {
  const r = compararMigrations([A, B], []);
  assert.equal(r.ultima, null);
  assert.equal(r.aplicadaEm, null);
  assert.equal(r.aplicadas, 0);
  assert.deepEqual(r.pendentes, [A, B]);
});

test("migration no banco que não está no disco NÃO é pendente", () => {
  // Acontece em rollback de código: o container voltou para um commit anterior,
  // o banco continua adiante. Não é o mesmo problema — e chamar de "pendente"
  // mandaria alguém aplicar algo que já está aplicado.
  const r = compararMigrations([A], [aplicada(A), aplicada(B)]);
  assert.deepEqual(r.pendentes, []);
  assert.equal(r.aplicadas, 2);
  assert.equal(r.ultima, B);
});

test("as listas saem ordenadas, para o diff da resposta ser estável", () => {
  const r = compararMigrations([C, A, B], []);
  assert.deepEqual(r.pendentes, [A, B, C]);
});
