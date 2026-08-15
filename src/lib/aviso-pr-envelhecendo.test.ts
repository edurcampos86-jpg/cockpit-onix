import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste do alarme de envelhecimento — scripts/aviso-pr-envelhecendo.sh.
 *
 * POR QUE ESTE TESTE EXISTE: num aviso que NUNCA fica vermelho, deixar de
 * detectar é invisível — mesma razão de `aviso-doc-modelos.test.ts`. E aqui
 * o risco é maior, porque o alarme existe justamente para tornar visível o
 * que passa despercebido: a #327 ficou 25,1 h errada com CI verde.
 */

const SCRIPT = join(process.cwd(), "scripts", "aviso-pr-envelhecendo.sh");

/** ISO de N horas atrás. */
function horasAtras(n: number): string {
  return new Date(Date.now() - n * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z");
}

/**
 * Monta um repo com um commit base e um commit tocando os arquivos dados,
 * e roda o alarme como o ci.yml faz.
 */
function rodar(horas: number, arquivos: string[]): { code: number; saida: string } {
  const raiz = mkdtempSync(join(tmpdir(), "aviso-idade-"));
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", raiz, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main");
    git("config", "user.email", "teste@exemplo.com");
    git("config", "user.name", "Teste");
    git("commit", "-q", "--allow-empty", "-m", "base");
    const base = git("rev-parse", "HEAD");
    for (const arq of arquivos) {
      const destino = join(raiz, arq);
      mkdirSync(join(destino, ".."), { recursive: true });
      writeFileSync(destino, "conteúdo\n");
    }
    let head = base;
    if (arquivos.length) {
      git("add", "-A");
      git("commit", "-q", "-m", "mudança");
      head = git("rev-parse", "HEAD");
    }
    const saida = execFileSync(SCRIPT, [horasAtras(horas), base, head], {
      encoding: "utf8",
      cwd: raiz,
    });
    return { code: 0, saida };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { code: err.status ?? -1, saida: (err.stdout ?? "") + (err.stderr ?? "") };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

// ── Inferência de faixa ──────────────────────────────────────────────────

test("prisma/** ⇒ vermelha, limiar de 48 h", () => {
  const { saida } = rodar(20, ["prisma/migrations/20260101_x/migration.sql"]);
  assert.match(saida, /vermelha/);
  assert.match(saida, /limite 48 h/);
  assert.doesNotMatch(saida, /::warning::/); // 20 h ainda está dentro
});

test("só docs e testes ⇒ verde, limiar de 8 h", () => {
  const { saida } = rodar(2, ["docs/x.md", "src/lib/y.test.ts"]);
  assert.match(saida, /verde/);
  assert.match(saida, /limite 8 h/);
});

test("código de app ⇒ amarela, limiar de 12 h", () => {
  const { saida } = rodar(2, ["src/app/page.tsx"]);
  assert.match(saida, /amarela/);
  assert.match(saida, /limite 12 h/);
});

test("prisma ganha de docs — uma migration no meio de docs ainda é vermelha", () => {
  const { saida } = rodar(2, ["docs/x.md", "prisma/schema.prisma"]);
  assert.match(saida, /vermelha/);
});

// ── O alarme dispara, e reporta o MÚLTIPLO ───────────────────────────────

test("verde acima de 8 h avisa, com o múltiplo da mediana", () => {
  const { code, saida } = rodar(9, ["docs/x.md"]);
  assert.equal(code, 0);
  assert.match(saida, /::warning::/);
  assert.match(saida, /9× a mediana/);
});

test("amarela acima de 12 h avisa", () => {
  const { saida } = rodar(13, ["src/app/page.tsx"]);
  assert.match(saida, /::warning::/);
  assert.match(saida, /13× a mediana/);
});

test("vermelha acima de 48 h avisa", () => {
  const { saida } = rodar(50, ["prisma/schema.prisma"]);
  assert.match(saida, /::warning::/);
  // 50 / 2,8 ≈ 18
  assert.match(saida, /18× a mediana de 2\.8 h/);
});

test("o caso da #327: 25,1 h numa PR amarela dispara", () => {
  // 25,1 h com CI verde o tempo todo foi o que ninguém viu.
  const { saida } = rodar(25.1, ["src/app/page.tsx"]);
  assert.match(saida, /::warning::/);
  assert.match(saida, /25\.1 h/);
});

// ── Limites exatos ───────────────────────────────────────────────────────

test("exatamente no limiar já avisa", () => {
  const { saida } = rodar(8.01, ["docs/x.md"]);
  assert.match(saida, /::warning::/);
});

test("logo abaixo do limiar não avisa", () => {
  const { saida } = rodar(7.5, ["docs/x.md"]);
  assert.doesNotMatch(saida, /::warning::/);
  assert.match(saida, /Dentro do esperado/);
});

// ── Degenerados ──────────────────────────────────────────────────────────

test("sem lista de arquivos assume amarela e diz que assumiu", () => {
  const { code, saida } = rodar(1, []);
  assert.equal(code, 0);
  assert.match(saida, /amarela/);
});

test("data ilegível avisa em vez de estourar", () => {
  const saida = execFileSync(SCRIPT, ["não-é-data", "", ""], { encoding: "utf8" });
  assert.match(saida, /Não consegui interpretar/);
});

test("nunca reprova — é aviso, não gate", () => {
  for (const h of [0, 9, 50, 500]) {
    assert.equal(rodar(h, ["src/app/page.tsx"]).code, 0, `h=${h} deveria sair 0`);
  }
});

test("sem argumento nenhum sai 2 — erro de configuração não é 'nada a avisar'", () => {
  let code = 0;
  try {
    execFileSync(SCRIPT, [], { encoding: "utf8" });
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  assert.equal(code, 2);
});
