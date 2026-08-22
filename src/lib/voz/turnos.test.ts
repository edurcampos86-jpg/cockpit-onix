import { test } from "node:test";
import assert from "node:assert/strict";
import { segmentarTurnos, atribuirEduardo, falasDoEduardo } from "./turnos";

const seg = (t: string, ctx = { vendedorEhEduardo: true, participantes: [] as string[] }) =>
  atribuirEduardo(segmentarTurnos(t), ctx);

test("Plaud com nomes: pega os turnos do Eduardo por nome", () => {
  const r = seg("[PLAUD — x | 01/01 | 30 min]\nEduardo Campos: olha só, faz a conta comigo\nMarcelo: entendi\nEduardo Campos: é a mesma coisa que a casa");
  assert.deepEqual(falasDoEduardo(r), ["olha só, faz a conta comigo", "é a mesma coisa que a casa"]);
  assert.ok(r.turnos.every((t) => !t.ehEduardo || t.confianca === "nome"));
});

test("Datacrazy: VENDEDOR vira Eduardo quando a reunião é dele", () => {
  const r = seg("VENDEDOR: bom dia\nCLIENTE: bom dia\nVENDEDOR: deixa eu te mostrar");
  assert.deepEqual(falasDoEduardo(r), ["bom dia", "deixa eu te mostrar"]);
  assert.equal(r.turnos[0]!.confianca, "papel");
});

test("VENDEDOR NÃO vira Eduardo quando a reunião é de outra pessoa", () => {
  const r = seg("VENDEDOR: bom dia\nCLIENTE: oi", { vendedorEhEduardo: false, participantes: [] });
  assert.deepEqual(falasDoEduardo(r), []);
});

test("outro membro do time nunca é confundido com Eduardo", () => {
  const r = seg("Thiago Vergal: eu explico assim\nCLIENTE: certo");
  assert.deepEqual(falasDoEduardo(r), []);
});

test("Speaker anônimo sozinho fica indeterminado e é descartado", () => {
  const r = seg("Speaker 1: bom dia\nSpeaker 2: bom dia");
  assert.deepEqual(falasDoEduardo(r), []);
});

test("eliminação: dois falantes e um é o cliente nomeado nos participantes", () => {
  const r = seg("Speaker 1: e aí\nMarcelo: tudo bem\nSpeaker 1: então olha", {
    vendedorEhEduardo: true,
    participantes: ["Marcelo Lima", "Eduardo Campos"],
  });
  assert.deepEqual(falasDoEduardo(r), ["e aí", "então olha"]);
  assert.equal(r.turnos[0]!.confianca, "eliminacao");
});

test("eliminação não roda com três falantes", () => {
  const r = seg("Speaker 1: a\nMarcelo: b\nSpeaker 3: c", {
    vendedorEhEduardo: true,
    participantes: ["Marcelo Lima"],
  });
  assert.deepEqual(falasDoEduardo(r), []);
});

test("quebra de linha dentro da fala continua o mesmo turno", () => {
  const r = seg("Eduardo: primeira parte\nsegunda parte\nCLIENTE: ok");
  assert.deepEqual(falasDoEduardo(r), ["primeira parte segunda parte"]);
});

test("dois-pontos no meio da frase não vira rótulo de falante", () => {
  const r = seg("Eduardo: olha só: a conta é essa\nCLIENTE: entendi");
  assert.deepEqual(falasDoEduardo(r), ["olha só: a conta é essa"]);
});

test("transcrição sem diarização não atribui nada a ninguém", () => {
  const r = seg("texto corrido sem nenhum rótulo de falante nesta linha");
  assert.ok(r.semDiarizacao);
  assert.deepEqual(falasDoEduardo(r), []);
});
