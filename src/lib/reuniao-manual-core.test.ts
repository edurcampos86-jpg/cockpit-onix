import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chaveLockReuniaoManual,
  externalIdReuniaoManual,
  validarMutacaoReuniaoManual,
} from "./reuniao-manual-core.ts";

const AGORA = new Date("2026-09-03T12:00:00.000Z");

test("usa um externalId estavel por slot", () => {
  assert.equal(externalIdReuniaoManual("ultima"), "slot:ultima");
  assert.equal(externalIdReuniaoManual("proxima"), "slot:proxima");
});

test("usa chave de lock determinística e separada por cliente e tipo", () => {
  assert.equal(
    chaveLockReuniaoManual("cliente-1", "ultima"),
    "reuniao-manual:cliente-1:ultima",
  );
  assert.notEqual(
    chaveLockReuniaoManual("cliente-1", "ultima"),
    chaveLockReuniaoManual("cliente-1", "proxima"),
  );
  assert.notEqual(
    chaveLockReuniaoManual("cliente-1", "ultima"),
    chaveLockReuniaoManual("cliente-2", "ultima"),
  );
});

test("aceita salvar ultima no passado e limpa o relato", () => {
  const r = validarMutacaoReuniaoManual(
    { tipo: "ultima", data: "2026-09-02T15:00:00.000Z", relato: "  Revisão da carteira  " },
    AGORA,
  );
  assert.equal(r.ok, true);
  if (!r.ok || r.data === null) return;
  assert.equal(r.data.toISOString(), "2026-09-02T15:00:00.000Z");
  assert.equal(r.relato, "Revisão da carteira");
});

test("aceita salvar proxima no futuro", () => {
  const r = validarMutacaoReuniaoManual(
    { tipo: "proxima", data: "2026-09-04T15:00:00.000Z" },
    AGORA,
  );
  assert.equal(r.ok, true);
});

test("exige relato ao salvar a ultima reuniao", () => {
  assert.deepEqual(
    validarMutacaoReuniaoManual(
      { tipo: "ultima", data: "2026-09-02T15:00:00.000Z", relato: "   " },
      AGORA,
    ),
    { ok: false, erro: "Relato do que foi tratado é obrigatório para a última reunião" },
  );
});

test("DELETE remove o tipo sem exigir data ou relato", () => {
  assert.deepEqual(validarMutacaoReuniaoManual({ tipo: "ultima" }, AGORA, "remover"), {
    ok: true,
    tipo: "ultima",
    data: null,
    relato: null,
  });
});

test("rejeita ultima futura e proxima passada", () => {
  assert.deepEqual(
    validarMutacaoReuniaoManual(
      { tipo: "ultima", data: "2026-09-04T12:00:00.000Z" },
      AGORA,
    ),
    { ok: false, erro: "A última reunião deve estar no passado" },
  );
  assert.deepEqual(
    validarMutacaoReuniaoManual(
      { tipo: "proxima", data: "2026-09-02T12:00:00.000Z" },
      AGORA,
    ),
    { ok: false, erro: "A próxima reunião deve estar no futuro" },
  );
});

test("rejeita contrato ambiguo ou data invalida", () => {
  assert.equal(validarMutacaoReuniaoManual({ data: null }, AGORA).ok, false);
  assert.equal(validarMutacaoReuniaoManual({ tipo: "ultima" }, AGORA).ok, false);
  assert.equal(
    validarMutacaoReuniaoManual({ tipo: "ultima", data: "nao-e-data" }, AGORA).ok,
    false,
  );
});
