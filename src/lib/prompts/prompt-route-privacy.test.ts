import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const fonte = readFileSync(
  path.join(
    process.cwd(),
    "src/app/api/configuracoes/implementacoes/[id]/prompt/route.ts",
  ),
  "utf8",
);

test("gerador não envia pedido, anexos ou PAT para serviço externo", () => {
  assert.doesNotMatch(fonte, /@anthropic-ai|downloadContrato|getConfig\(/);
  assert.doesNotMatch(fonte, /fetch\(|https?:\/\//);
  assert.match(fonte, /processamento: "local"/);
});

test("recorte de dono acontece na consulta que também carrega o PAT", () => {
  assert.match(fonte, /findFirst\(\{[\s\S]*?where: \{ id, \.\.\.filtroDeDono\(quem\) \}/);
  assert.match(fonte, /pats: \{[\s\S]*?where: \{ vigente: true \}/);
});

test("somente o prompt final e o histórico mínimo são persistidos", () => {
  assert.match(fonte, /promptGerado: prompt/);
  assert.match(fonte, /versaoTemplate: versao/);
  assert.match(fonte, /conversaIA: \{/);
  assert.doesNotMatch(fonte, /pdfBase64|b2Key|contentType/);
});
