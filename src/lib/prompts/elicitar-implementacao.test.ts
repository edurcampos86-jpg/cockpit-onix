import assert from "node:assert/strict";
import { test } from "node:test";
import {
  inferirSinaisFallback,
  normalizarRespostas,
  perguntasFallback,
} from "./elicitar-implementacao";

test("respostas vazias não entram no histórico e texto longo é limitado", () => {
  const out = normalizarRespostas([
    { pergunta: "P1", resposta: "  resposta  " },
    { pergunta: "P2", resposta: " " },
    { pergunta: "P3", resposta: "x".repeat(5_000) },
  ]);
  assert.deepEqual(out[0], { pergunta: "P1", resposta: "resposta" });
  assert.equal(out.length, 2);
  assert.equal(out[1].resposta.length, 4_000);
});

test("fallback inclui pergunta específica de anexo só quando aplicável", () => {
  assert.equal(perguntasFallback(false).some((p) => p.id === "anexos"), false);
  assert.equal(perguntasFallback(true).some((p) => p.id === "anexos"), true);
});

test("inferência de fallback é conservadora e reconhece frentes combinadas", () => {
  const out = inferirSinaisFallback("Criar modal com IA e upload de PDF");
  assert.equal(out.mexeIa, true);
  assert.equal(out.mexeUpload, true);
  assert.equal(out.multiplasFrentes, true);
  assert.equal(out.soUi, false);
});
