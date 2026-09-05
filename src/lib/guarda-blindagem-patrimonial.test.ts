import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste da guarda do termo proibido — scripts/guarda-blindagem-patrimonial.sh.
 *
 * POR QUE ESTE TESTE EXISTE: "blindagem patrimonial" não é instituto jurídico
 * e sugere garantia que o produto não cumpre — exposição perante CVM e ANCORD.
 * O termo tinha entrado no SYSTEM_PROMPT de produção, de onde saía em TODO
 * roteiro gerado. Prompt errado não erra uma vez: erra em toda geração, e o
 * post já publicado não volta atrás.
 *
 * Exercita o script REAL, no mesmo padrão de `guarda-not-null-sem-default.test.ts`:
 * um teste que reimplementasse o AWK em TypeScript passaria mesmo com o script
 * quebrado — que é precisamente o cenário contra o qual isto existe.
 *
 * Este arquivo é `.test.ts` e portanto a própria guarda o ignora, o que é o que
 * permite escrever o termo à vontade nas fixtures abaixo.
 */

const SCRIPT = join(process.cwd(), "scripts", "guarda-blindagem-patrimonial.sh");

/** Monta uma árvore de arquivos temporária e roda a guarda contra ela. */
function rodarGuarda(arquivos: Record<string, string>): {
  code: number;
  saida: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "guarda-bp-"));
  try {
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      const destino = join(raiz, nome);
      mkdirSync(join(destino, ".."), { recursive: true });
      writeFileSync(destino, conteudo);
    }
    try {
      const saida = execFileSync(SCRIPT, [raiz], { encoding: "utf8" });
      return { code: 0, saida };
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      return { code: err.status ?? -1, saida: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

// ── O caso que a guarda existe para pegar ────────────────────────────────

test("reprova o termo no prompt de produção", () => {
  // O texto literal que estava em src/lib/integrations/claude-ai.ts e motivou
  // a guarda.
  const { code, saida } = rodarGuarda({
    "lib/claude-ai.ts":
      "const SYSTEM_PROMPT = `Você é o assistente de conteúdo do Eduardo Campos " +
      "(@eduardorcampos), Mentor de Blindagem Patrimonial com 19 anos`;\n",
  });
  assert.equal(code, 1);
  assert.match(saida, /blindagem patrimonial/i);
});

test("aponta arquivo e linha do ofensor", () => {
  const { saida } = rodarGuarda({
    "lib/prompt.ts":
      "const a = 1;\n" +
      "const b = 2;\n" +
      'const c = "Mentor de Blindagem Patrimonial";\n',
  });
  // Sem arquivo:linha, achar a ocorrência num `src/` inteiro vira caça manual.
  assert.match(saida, /prompt\.ts:3:/);
});

test("aponta SÓ a linha ofensora, não o arquivo inteiro", () => {
  const { code, saida } = rodarGuarda({
    "lib/mix.ts":
      'const ok = "Planejamento Patrimonial";\n' +
      'const mal = "Blindagem Patrimonial";\n' +
      'const tambemOk = "sucessão e holding";\n',
  });
  assert.equal(code, 1);
  const linhas = saida.split("\n").filter((l) => /mix\.ts:\d+:/.test(l));
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /mix\.ts:2:/);
});

test("pega as grafias que aparecem na prática", () => {
  // Hashtag, kebab, snake e caixa alta são as formas em que o termo circula:
  // legenda de post, slug de arquivo, chave de config, título de slide.
  const casos: Record<string, string> = {
    hashtag: 'const h = "#blindagempatrimonial #patrimonio";\n',
    kebab: 'const s = "blindagem-patrimonial";\n',
    snake: 'const u = "blindagem_patrimonial";\n',
    caixaAlta: 'const c = "BLINDAGEM PATRIMONIAL";\n',
    acento: 'const o = "blindagem patrimônio";\n',
    plural: 'const p = "blindagem patrimoniais";\n',
  };
  for (const [nome, conteudo] of Object.entries(casos)) {
    const { code } = rodarGuarda({ [`lib/${nome}.ts`]: conteudo });
    assert.equal(code, 1, `grafia "${nome}" escapou da guarda`);
  }
});

test("vale para markdown de skill, não só para .ts", () => {
  // As skills em .claude/skills são prompt: o que está nelas vira conteúdo
  // publicado com a mesma força do SYSTEM_PROMPT.
  const { code, saida } = rodarGuarda({
    "skills/x/SKILL.md": "| P1 | Blindagem Patrimonial | Carrossel |\n",
  });
  assert.equal(code, 1);
  assert.match(saida, /SKILL\.md:1:/);
});

test("a mensagem ensina o termo correto e o motivo", () => {
  // Reprovar sem dizer o que fazer transforma a guarda em obstáculo: quem
  // esbarra nela contorna, e o termo volta por outro caminho.
  const { saida } = rodarGuarda({
    "lib/x.ts": 'const t = "blindagem patrimonial";\n',
  });
  assert.match(saida, /PLANEJAMENTO PATRIMONIAL/);
  assert.match(saida, /CVM/);
  assert.match(saida, /instituto jurídico/);
});

test("acha o ofensor mesmo enterrado entre arquivos limpos", () => {
  const { code, saida } = rodarGuarda({
    "a/limpo.ts": 'const a = "Planejamento Patrimonial";\n',
    "b/sujo.tsx": 'const b = "Blindagem Patrimonial";\n',
    "c/tambem-limpo.md": "# Sucessão e holding\n",
  });
  assert.equal(code, 1);
  assert.match(saida, /sujo\.tsx/);
});

// ── Os falsos positivos que não podem acontecer ──────────────────────────
// Guarda que reprova o uso legítimo é guarda que alguém desliga.

test('"blindagem" sozinha passa', () => {
  // O caso real: src/app/api/backoffice/clientes/[id]/reunioes/manual/route.ts
  // usa "Blindagem adicional" no sentido corrente de "proteção a mais". Nada
  // a ver com o posicionamento, e reprovar encheria de vermelho PR alheia.
  const { code } = rodarGuarda({
    "api/route.ts":
      "  // Blindagem adicional: se uma versão anterior/incompleta tiver deixado\n" +
      '  const modo = "blindagem";\n',
  });
  assert.equal(code, 0);
});

test("a tag BLINDAGEM do ManyChat passa", () => {
  // Chave configurada FORA do repositório e já gravada nos subscribers.
  // Renomear aqui não renomeia lá — só faz o lead cair sem produto.
  const { code } = rodarGuarda({
    "lib/manychat.ts":
      "const KEYWORD_PRODUCT_MAP = {\n" +
      '  BLINDAGEM: "investimentos",\n' +
      '  PLANEJAMENTO: "investimentos",\n' +
      "};\n",
  });
  assert.equal(code, 0);
});

test("alternância de regex com | não é lida como expressão", () => {
  // src/lib/integrations/instagram-mcp.ts classifica legendas JÁ publicadas
  // com /blindagem|patrimônio|.../. O "|" separa alternativas, não forma o
  // termo — e esse matcher precisa continuar reconhecendo o acervo antigo.
  const { code } = rodarGuarda({
    "lib/instagram-mcp.ts":
      "if (/blindagem|patrimônio|planejamento|sucessão/.test(lower)) return 'P1'\n",
  });
  assert.equal(code, 0);
});

test("comentário citando o termo passa", () => {
  // Mesma regra das guardas do FTS e do NOT NULL. A nota que EXPLICA por que
  // o termo é proibido precisa poder escrevê-lo.
  const { code } = rodarGuarda({
    "lib/nota.ts":
      '// O termo "blindagem patrimonial" foi proibido pelo Projeto v6.0.\n' +
      "/* blindagem patrimonial: ver guarda no CI */\n" +
      " * blindagem patrimonial em bloco JSDoc\n" +
      "-- blindagem patrimonial em SQL\n" +
      "<!-- blindagem patrimonial em markdown -->\n",
  });
  assert.equal(code, 0);
});

test("arquivo de teste passa", () => {
  // Fixture de webhook replica o que o LEAD escreveu: texto de terceiro, não
  // cópia nossa, e não vai ao público. É o caso de
  // src/lib/manychat-lead/mensagem.test.ts.
  const { code } = rodarGuarda({
    "lib/mensagem.test.ts":
      'const fixture = { texto_mensagem: "quero saber sobre blindagem patrimonial" };\n',
    "lib/pagina.test.tsx":
      'render(<X titulo="Blindagem Patrimonial" />);\n',
  });
  assert.equal(code, 0);
});

test("o termo correto passa", () => {
  const { code, saida } = rodarGuarda({
    "lib/ok.ts":
      'const P1 = "Planejamento Patrimonial";\n' +
      'const h = "#planejamentopatrimonial";\n',
  });
  assert.equal(code, 0);
  assert.match(saida, /OK:/);
});

// ── Contrato de saída ────────────────────────────────────────────────────

test("diretório inexistente sai 2, e não 0", () => {
  // Sair 0 aqui seria o pior desfecho: caminho digitado errado no ci.yml
  // deixaria o passo verde para sempre, sem nunca ler um arquivo.
  let code = -1;
  try {
    execFileSync(SCRIPT, [join(tmpdir(), "nao-existe-guarda-bp")], { encoding: "utf8" });
    code = 0;
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  assert.equal(code, 2);
});

test("aceita vários diretórios de uma vez", () => {
  // O ci.yml chama com `src .claude/skills`: os dois precisam ser varridos na
  // mesma invocação, senão o segundo vira passo que ninguém lembra de somar.
  const raiz = mkdtempSync(join(tmpdir(), "guarda-bp-multi-"));
  try {
    mkdirSync(join(raiz, "a"), { recursive: true });
    mkdirSync(join(raiz, "b"), { recursive: true });
    writeFileSync(join(raiz, "a", "limpo.ts"), 'const x = "Planejamento";\n');
    writeFileSync(join(raiz, "b", "sujo.ts"), 'const y = "Blindagem Patrimonial";\n');
    let code = 0;
    let saida = "";
    try {
      saida = execFileSync(SCRIPT, [join(raiz, "a"), join(raiz, "b")], { encoding: "utf8" });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? -1;
      saida = (err.stdout ?? "") + (err.stderr ?? "");
    }
    assert.equal(code, 1);
    assert.match(saida, /sujo\.ts/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
