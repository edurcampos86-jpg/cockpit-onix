import assert from "node:assert/strict";
import { test } from "node:test";

import { resolverDestinatarios, type MembroCarteira } from "./destinatarios-core.ts";

const dono = (id: string, tel: string | null = "5571999999999"): MembroCarteira => ({
  pessoaId: id, nome: `Dono ${id}`, telefone: tel, tipo: "dono",
});
const apoia = (id: string, tel: string | null = "5571988888888"): MembroCarteira => ({
  pessoaId: id, nome: `Apoio ${id}`, telefone: tel, tipo: "apoia",
});

test("assessor vem primeiro, backoffice depois", () => {
  const r = resolverDestinatarios([apoia("b"), dono("a")]);
  assert.equal(r.destinatarios[0]!.papel, "assessor");
  assert.equal(r.destinatarios[1]!.papel, "backoffice");
});

test("dono vira assessor e quem apoia vira backoffice", () => {
  const r = resolverDestinatarios([dono("a"), apoia("b")]);
  assert.deepEqual(r.destinatarios.map((d) => d.papel), ["assessor", "backoffice"]);
});

// A mesma pessoa pode ser dona de uma carteira e apoiar outra com o mesmo CGE.
// Receber duas vezes é o jeito mais rápido de ensinar alguém a ignorar o canal.
test("a mesma pessoa não recebe duas vezes", () => {
  const r = resolverDestinatarios([dono("a"), { ...apoia("a"), pessoaId: "a" }]);
  assert.equal(r.destinatarios.length, 1);
  assert.equal(r.destinatarios[0]!.papel, "assessor", "o papel mais forte vence");
});

test("quem não tem telefone é reportado, não silenciado", () => {
  const r = resolverDestinatarios([dono("a", null), apoia("b")]);
  assert.deepEqual(r.semTelefone, ["Dono a"]);
  assert.equal(r.destinatarios.length, 1);
});

test("telefone só com espaço conta como ausente", () => {
  const r = resolverDestinatarios([dono("a", "   ")]);
  assert.equal(r.destinatarios.length, 0);
  assert.deepEqual(r.semTelefone, ["Dono a"]);
});

// O caso que não pode passar calado: sem `orfao`, um cliente com carteira
// desconfigurada pararia de alertar e ninguém saberia que parou.
test("carteira sem ninguém alcançável marca órfão", () => {
  assert.equal(resolverDestinatarios([]).orfao, true);
  assert.equal(resolverDestinatarios([dono("a", null)]).orfao, true);
});

test("com pelo menos um alcançável não é órfão", () => {
  assert.equal(resolverDestinatarios([apoia("b")]).orfao, false);
});
