import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste da guarda de skills — scripts/guarda-skills.sh.
 *
 * POR QUE ESTE TESTE EXISTE: skill quebrada não derruba build, não reprova
 * teste e não aparece em lint — ela simplesmente não carrega, em silêncio, na
 * próxima sessão do Claude Code. A #327 ficou 25,1 h versionando a versão
 * errada da onix-entrega-segura sem que nada acusasse.
 *
 * Exercita o script REAL, no mesmo padrão de `guarda-not-null-sem-default.test.ts`:
 * um teste que reimplementasse as regras em TypeScript passaria mesmo com o
 * script quebrado — que é precisamente o cenário contra o qual isto existe.
 */

const SCRIPT = join(process.cwd(), "scripts", "guarda-skills.sh");

const FRONTMATTER_OK = [
  "---",
  "name: minha-skill",
  "description: faz alguma coisa",
  "version: 1.0",
  "updated: 2026-08-13",
  "---",
  "",
  "# Minha Skill",
  "",
].join("\n");

/** Monta um diretório de skills temporário e roda a guarda contra ele. */
function rodarGuarda(arquivos: Record<string, string>): {
  code: number;
  saida: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "guarda-skills-"));
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

// ── O caminho feliz ──────────────────────────────────────────────────────

test("aprova skill íntegra", () => {
  const { code, saida } = rodarGuarda({ "minha-skill/SKILL.md": FRONTMATTER_OK });
  assert.equal(code, 0);
  assert.match(saida, /1 skill\(s\).*íntegras/);
});

// ── Regra 1 · pasta == name ──────────────────────────────────────────────

test("reprova pasta com nome diferente do campo name", () => {
  const { code, saida } = rodarGuarda({ "outra-pasta/SKILL.md": FRONTMATTER_OK });
  assert.equal(code, 1);
  assert.match(saida, /outra-pasta/);
  assert.match(saida, /≠ name 'minha-skill'/);
});

// ── Regra 2 · frontmatter ────────────────────────────────────────────────

test("reprova frontmatter que não abre na linha 1", () => {
  // Uma linha em branco no topo já desqualifica: o `---` da linha 2 é
  // separador horizontal de markdown, não frontmatter.
  const { code, saida } = rodarGuarda({ "minha-skill/SKILL.md": "\n" + FRONTMATTER_OK });
  assert.equal(code, 1);
  assert.match(saida, /não abre com '---' na linha 1/);
});

test("reprova frontmatter que nunca fecha", () => {
  const { code, saida } = rodarGuarda({
    "minha-skill/SKILL.md": "---\nname: minha-skill\ndescription: x\nversion: 1.0\nupdated: 2026-08-13\n",
  });
  assert.equal(code, 1);
  assert.match(saida, /nunca fecha/);
});

// ── Regra 3 · campos obrigatórios ────────────────────────────────────────

for (const campo of ["name", "description", "version", "updated"]) {
  test(`reprova frontmatter sem '${campo}'`, () => {
    const conteudo = FRONTMATTER_OK.split("\n")
      .filter((l) => !l.startsWith(`${campo}:`))
      .join("\n");
    const { code, saida } = rodarGuarda({ "minha-skill/SKILL.md": conteudo });
    assert.equal(code, 1);
    assert.match(saida, new RegExp(`campo obrigatório '${campo}'`));
  });
}

test("campo declarado só no corpo não conta como frontmatter", () => {
  // `version:` depois do fechamento é prosa, não declaração — e foi a
  // ausência de `version` que deixou a #327 versionar a skill errada.
  const conteudo = FRONTMATTER_OK.replace("version: 1.0\n", "") + "\nversion: 2.2\n";
  const { code, saida } = rodarGuarda({ "minha-skill/SKILL.md": conteudo });
  assert.equal(code, 1);
  assert.match(saida, /campo obrigatório 'version'/);
});

// ── Regra 4 · UTF-8 e caractere de controle ──────────────────────────────

test("reprova caractere de controle no meio do texto", () => {
  const conteudo = FRONTMATTER_OK.replace("# Minha Skill", "# Minha\u0007Skill");
  const { code, saida } = rodarGuarda({ "minha-skill/SKILL.md": conteudo });
  assert.equal(code, 1);
  assert.match(saida, /caractere de controle/);
});

test("tab não é acusado como caractere de controle", () => {
  const conteudo = FRONTMATTER_OK.replace("# Minha Skill", "# Minha Skill\n\n\tindentado");
  const { code } = rodarGuarda({ "minha-skill/SKILL.md": conteudo });
  assert.equal(code, 0);
});

// ── Regra 5 · quebra de linha final ──────────────────────────────────────

test("reprova arquivo sem quebra de linha final", () => {
  const { code, saida } = rodarGuarda({
    "minha-skill/SKILL.md": FRONTMATTER_OK.trimEnd(),
  });
  assert.equal(code, 1);
  assert.match(saida, /não termina em quebra de linha/);
});

// ── Ausências ────────────────────────────────────────────────────────────

test("reprova pasta sem SKILL.md", () => {
  const { code, saida } = rodarGuarda({ "minha-skill/LEIAME.md": "nada\n" });
  assert.equal(code, 1);
  assert.match(saida, /não tem SKILL.md/);
});

test("diretório inexistente sai 0 — a guarda não reprova a si mesma", () => {
  // A guarda entra no repo na PR seguinte à que traz as skills; na própria
  // execução dela o diretório ainda não está na base.
  const saida = execFileSync(SCRIPT, [join(tmpdir(), "nao-existe-guarda-skills")], {
    encoding: "utf8",
  });
  assert.match(saida, /não existe/);
});

// ── Acumula, não para na primeira ────────────────────────────────────────

test("reporta todas as skills quebradas num run só", () => {
  const semUpdated = FRONTMATTER_OK.split("\n")
    .filter((l) => !l.startsWith("updated:"))
    .join("\n");
  const { code, saida } = rodarGuarda({
    "minha-skill/SKILL.md": semUpdated,
    "outra/SKILL.md": FRONTMATTER_OK.replace("name: minha-skill", "name: outra-errada"),
  });
  assert.equal(code, 1);
  assert.match(saida, /campo obrigatório 'updated'/);
  assert.match(saida, /≠ name 'outra-errada'/);
  assert.match(saida, /2 violação\(ões\)/);
});
