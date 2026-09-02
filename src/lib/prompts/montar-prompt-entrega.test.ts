import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLACEHOLDERS,
  templateCorpo,
  montarPromptEntrega,
  versaoTemplate,
  type DadosPromptEntrega,
} from "./montar-prompt-entrega";

const base: DadosPromptEntrega = {
  empresaNome: "Onix Capital",
  tipo: "melhoria",
  oQue: "criar dashboard único de receita por assessor",
  como: "uma tela que agrega automaticamente",
  porQue: "hoje perdemos tempo consolidando na mão",
};

test("todo placeholder do .md é conhecido pelo montador", () => {
  const usados = new Set(
    [...templateCorpo().matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
  );
  const conhecidos = new Set<string>(PLACEHOLDERS);
  for (const p of usados) {
    assert.ok(conhecidos.has(p), `placeholder {{${p}}} não tem valor no montador`);
  }
});

test("o prompt montado não deixa placeholder para trás", () => {
  const out = montarPromptEntrega(base);
  assert.equal(/\{\{\w+\}\}/.test(out), false, out);
});

test("o comentário de manutenção do template não vaza para o prompt", () => {
  const out = montarPromptEntrega(base);
  assert.equal(out.includes("<!--"), false);
  assert.equal(out.includes("REGRAS DE EDIÇÃO"), false);
});

test("a metodologia obrigatória está sempre no cabeçalho", () => {
  const out = montarPromptEntrega(base);
  assert.match(out, /onix-entrega-segura/);
  assert.match(out, /Claude Code/);
  assert.match(out, /~\/dev\/cockpit-onix/);
  assert.match(out, /antes do merge/);
});

test("as respostas do usuário aparecem nas seções do Golden Circle", () => {
  const out = montarPromptEntrega(base);
  assert.match(out, /## O quê\n\ncriar dashboard único de receita por assessor/);
  assert.match(out, /## Como\n\numa tela que agrega automaticamente/);
  assert.match(out, /## Por quê\n\nhoje perdemos tempo consolidando na mão/);
  assert.match(out, /Onix Capital/);
});

test("campo opcional vazio vira aviso explícito, não seção em branco", () => {
  const out = montarPromptEntrega({ ...base, como: "   " });
  assert.match(out, /## Como\n\n_\(não informado pelo usuário\)_/);
});

test("orquestra-multiagente só entra quando há múltiplas frentes", () => {
  assert.equal(montarPromptEntrega(base).includes("orquestra-multiagente"), false);
  assert.match(
    montarPromptEntrega({ ...base, sinais: { multiplasFrentes: true } }),
    /orquestra-multiagente/,
  );
});

test("lembretes de banco só entram quando a mudança toca schema/migration", () => {
  const semBanco = montarPromptEntrega(base);
  assert.equal(semBanco.includes("shadow-DB"), false);
  assert.equal(semBanco.includes("PainelEmailAI"), false);

  const comBanco = montarPromptEntrega({ ...base, sinais: { mexeMigration: true } });
  assert.match(comBanco, /shadow-DB/);
  assert.match(comBanco, /PainelEmailAI/);
  assert.match(comBanco, /db push/);
});

test("lembretes que valem sempre não dependem de sinal", () => {
  const out = montarPromptEntrega(base);
  assert.match(out, /max-old-space-size=8192/);
  assert.match(out, /Nixpacks/);
});

test("cada sinal liga só o seu lembrete", () => {
  const rbac = montarPromptEntrega({ ...base, sinais: { mexeRbac: true } });
  assert.match(rbac, /isAdmin/);
  assert.equal(rbac.includes("Backblaze"), false);

  const upload = montarPromptEntrega({ ...base, sinais: { mexeUpload: true } });
  assert.match(upload, /Backblaze B2/);
  assert.equal(upload.includes("isAdmin"), false);

  const ia = montarPromptEntrega({ ...base, sinais: { mexeIa: true } });
  assert.match(ia, /ANTHROPIC_API_KEY/);

  const ui = montarPromptEntrega({ ...base, sinais: { soUi: true } });
  assert.match(ui, /feature flag/);
});

test("elicitação e anexos entram como blocos, e somem quando não há", () => {
  const magro = montarPromptEntrega(base);
  assert.equal(magro.includes("Detalhes levantados"), false);
  assert.equal(magro.includes("Contexto visual"), false);

  const cheio = montarPromptEntrega({
    ...base,
    elicitacao: [{ pergunta: "Muda schema?", resposta: "Não, só leitura." }],
    anexos: [{ nomeArquivo: "print.png", descricao: "tela atual com 3 colunas" }],
  });
  assert.match(cheio, /## Detalhes levantados/);
  assert.match(cheio, /\*\*Muda schema\?\*\* Não, só leitura\./);
  assert.match(cheio, /## Contexto visual/);
  assert.match(cheio, /`print\.png` — tela atual com 3 colunas/);
});

test("anexo sem descrição ainda é listado (fallback sem IA)", () => {
  const out = montarPromptEntrega({
    ...base,
    anexos: [{ nomeArquivo: "print.png" }],
  });
  assert.match(out, /`print\.png`/);
  assert.equal(out.includes("print.png` —"), false);
});

test("o prompt não acumula linhas em branco de blocos vazios", () => {
  assert.equal(/\n{3,}/.test(montarPromptEntrega(base)), false);
});

test("a versão da metodologia é legível a partir do .md", () => {
  assert.ok(versaoTemplate() >= 2);
});

test("PAT localizado calibra o prompt sem carregar o PDF inteiro", () => {
  const out = montarPromptEntrega({
    ...base,
    perfilPat: {
      arquetipoCodigo: 76,
      arquetipoNome: "Promocional de Ação Livre",
      orientacao: "Social",
      principaisCompetencias: ["Comunicação", "Iniciativa"],
      estiloComunicacao: "Visual e direto",
    },
  });
  assert.match(out, /76 · Promocional de Ação Livre/);
  assert.match(out, /Visual e direto/);
  assert.equal(out.includes("pdfBase64"), false);
});

test("PAT ausente instrui pedir o anexo só quando a personalização importar", () => {
  const out = montarPromptEntrega({ ...base, perfilPat: null });
  assert.match(out, /Perfil PAT vigente do solicitante não foi localizado/);
  assert.match(out, /peça que ele anexe o PAT/);
});

test("o template traz time virtual, gauntlet e aceita Codex ou Claude Code", () => {
  const out = montarPromptEntrega(base);
  assert.match(out, /Agente Master/);
  assert.match(out, /Codex ou Claude Code/);
  assert.match(out, /Gauntlet Loop/);
  assert.match(out, /no máximo cinco ciclos/);
});
