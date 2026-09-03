import assert from "node:assert/strict";
import { test } from "node:test";
import { validarCamposTemporaisInteracao } from "./interacao-input-core.ts";

const AGORA = new Date("2026-09-03T12:00:00.000Z");

test("usa agora e duração nula quando campos não são enviados", () => {
  assert.deepEqual(validarCamposTemporaisInteracao({ tipo: "ligacao" }, AGORA), {
    ok: true,
    data: AGORA,
    duracaoMin: null,
  });
});

test("aceita data histórica e duração inteira em string", () => {
  assert.deepEqual(
    validarCamposTemporaisInteracao(
      { tipo: "reuniao", data: "2026-09-02T10:00:00.000Z", duracaoMin: "45" },
      AGORA,
    ),
    { ok: true, data: new Date("2026-09-02T10:00:00.000Z"), duracaoMin: 45 },
  );
});

test("rejeita data inválida antes da persistência", () => {
  assert.deepEqual(
    validarCamposTemporaisInteracao({ tipo: "ligacao", data: "não-é-data" }, AGORA),
    { ok: false, erro: "Data inválida" },
  );
});

test("rejeita ligação e reunião futuras", () => {
  for (const tipo of ["ligacao", "reuniao"]) {
    assert.deepEqual(
      validarCamposTemporaisInteracao(
        { tipo, data: "2026-09-03T12:00:00.001Z" },
        AGORA,
      ),
      { ok: false, erro: "A data da ligação ou reunião não pode estar no futuro" },
    );
  }
});

test("rejeita duração NaN, fracionária, negativa ou não numérica", () => {
  for (const duracaoMin of [Number.NaN, 1.5, -1, "abc"]) {
    const r = validarCamposTemporaisInteracao({ tipo: "ligacao", duracaoMin }, AGORA);
    assert.equal(r.ok, false);
  }
});
