import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function fonte(caminho: string): string {
  return readFileSync(new URL(caminho, import.meta.url), "utf8");
}

test("a ficha monta a seção pela fronteira server-side", () => {
  const page = fonte("../../app/time/[id]/page.tsx");
  const section = fonte("../../app/time/_components/questionario-pat-section.tsx");

  assert.match(page, /<QuestionarioPatSection pessoaId=\{pessoa\.id\}/);
  assert.match(section, /carregarQuestionarioPat\(pessoaId\)/);
  assert.match(section, /if \(!dados\) return null/);
});

test("flag e hierarquia recortam o alvo antes de carregar PAT e respostas", () => {
  const loader = fonte("questionario-pat-loader.ts");

  assert.ok(
    loader.indexOf("questionarioPatTimeHabilitado()") <
      loader.indexOf("prisma.pessoa.findFirst"),
  );
  assert.match(loader, /master \? \{\} : \{ lideradoPorId: ctx\.pessoa!\.id \}/);
  assert.match(loader, /where: \{ vigente: true, status: "extraido" \}/);
});

test("toda escrita repete a guarda e não chama IA", () => {
  const actions = fonte("../../app/actions/questionario-pat.ts");

  const guardas = actions.match(/resolverAcessoQuestionarioPat\(pessoaId\)/g) ?? [];
  assert.equal(guardas.length, 2);
  assert.doesNotMatch(actions, /ANTHROPIC|extrairPat|PAT_PROFILES/);
  assert.match(actions, /questionarioPatAcompanhamento\.create/);
  assert.doesNotMatch(actions, /questionarioPatAcompanhamento\.(update|delete)/);
  assert.equal((actions.match(/!acesso\.pessoa\.patVigente/g) ?? []).length, 2);
  assert.match(actions, /atualizadoEm: existente\.atualizadoEm/);
  assert.match(actions, /falhaAoPersistir/);
});

test("a UI mantém labels, feedback acessível e alvos de toque", () => {
  const panel = fonte("../../app/time/_components/questionario-pat-panel.tsx");
  const timeline = fonte("../../app/time/_components/questionario-pat-timeline.tsx");

  for (const componente of [panel, timeline]) {
    assert.match(componente, /htmlFor=/);
    assert.match(componente, /aria-live="polite"/);
    assert.match(componente, /min-h-11/);
  }
});

test("a UI consome os ids e a ordem gerados pelo PAT", () => {
  const panel = fonte("../../app/time/_components/questionario-pat-panel.tsx");

  assert.match(panel, /perguntaId: "evidenciasProgresso"/);
  assert.equal(
    (panel.match(/camposNaOrdemDasPerguntas\(dados\.perguntas\)\.map/g) ?? []).length,
    2,
  );
});

test("o navegador recebe apenas a existência do PAT, não os sinais do laudo", () => {
  const loader = fonte("questionario-pat-loader.ts");
  const tipoPublico = loader.slice(
    loader.indexOf("export type QuestionarioPatCarregado"),
    loader.indexOf("function perguntasDoSnapshot"),
  );

  assert.match(tipoPublico, /pat: \{ id: string \} \| null/);
  assert.doesNotMatch(tipoPublico, /orientacao|perspectiva|ambienteNome/);
});
