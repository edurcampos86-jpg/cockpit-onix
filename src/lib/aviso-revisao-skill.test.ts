import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste do contador de revisão da skill — scripts/aviso-revisao-skill.sh.
 *
 * POR QUE ESTE TESTE EXISTE: num aviso que NUNCA fica vermelho, deixar de
 * detectar é invisível. Mesma razão de `aviso-doc-modelos.test.ts` — o teste
 * cobre o "sai 0 sempre" junto com a detecção, senão o script poderia parar
 * de contar sem ninguém notar.
 */

const SCRIPT = join(process.cwd(), "scripts", "aviso-revisao-skill.sh");

/** Monta um repositório temporário com N commits depois do marco zero. */
function repoCom(commitsDepoisDoMarco: number): { raiz: string; marco: string } {
  const raiz = mkdtempSync(join(tmpdir(), "aviso-revisao-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8" }).trim();

  git("init", "-q", "-b", "main");
  git("config", "user.email", "teste@exemplo.com");
  git("config", "user.name", "Teste");
  git("commit", "-q", "--allow-empty", "-m", "marco zero (#327)");
  const marco = git("rev-parse", "HEAD");
  for (let i = 1; i <= commitsDepoisDoMarco; i++) {
    git("commit", "-q", "--allow-empty", "-m", `pr ${i} (#${327 + i})`);
  }
  return { raiz, marco };
}

function rodar(
  commitsDepoisDoMarco: number,
  limite?: string
): { code: number; saida: string } {
  const { raiz, marco } = repoCom(commitsDepoisDoMarco);
  try {
    const args = [marco, "HEAD", ...(limite ? [limite] : [])];
    const saida = execFileSync(SCRIPT, args, { encoding: "utf8", cwd: raiz });
    return { code: 0, saida };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, saida: (err.stdout ?? "") + (err.stderr ?? "") };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("abaixo do limite: informa a contagem e não avisa", () => {
  const { code, saida } = rodar(9);
  assert.equal(code, 0);
  assert.match(saida, /9\/10 PRs/);
  assert.doesNotMatch(saida, /::warning::/);
});

test("exatamente no limite: avisa", () => {
  const { code, saida } = rodar(10);
  assert.equal(code, 0);
  assert.match(saida, /::warning::/);
  assert.match(saida, /10 PRs fechadas/);
});

test("acima do limite: segue avisando", () => {
  const { saida } = rodar(23);
  assert.match(saida, /::warning::/);
  assert.match(saida, /23 PRs fechadas/);
});

test("limite é parametrizável", () => {
  const { saida } = rodar(3, "3");
  assert.match(saida, /::warning::/);
});

test("nunca reprova — é aviso, não gate", () => {
  // O ponto do desenho: "está na hora de revisar o método" não pode reprovar
  // a PR de outra pessoa, que não tem nada a ver com isso.
  for (const n of [0, 10, 99]) {
    assert.equal(rodar(n).code, 0, `n=${n} deveria sair 0`);
  }
});

test("marco zero inexistente avisa em vez de estourar", () => {
  const { raiz } = repoCom(1);
  try {
    const saida = execFileSync(SCRIPT, ["0".repeat(40), "HEAD"], {
      encoding: "utf8",
      cwd: raiz,
    });
    assert.match(saida, /não está protegendo nada/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});

test("sem marco zero, sai 2 e explica o uso", () => {
  // Erro de invocação é diferente de "nada a avisar": sair 0 aqui esconderia
  // um step de CI mal configurado.
  const { raiz } = repoCom(1);
  try {
    let code = 0;
    try {
      execFileSync(SCRIPT, [], { encoding: "utf8", cwd: raiz });
    } catch (e) {
      code = (e as { status?: number }).status ?? -1;
    }
    assert.equal(code, 2);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
