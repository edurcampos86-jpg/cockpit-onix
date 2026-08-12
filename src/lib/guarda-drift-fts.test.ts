import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste da guarda de drift do índice FTS — scripts/guarda-drift-fts.sh.
 *
 * POR QUE ESTE TESTE EXISTE: a guarda protege o índice full-text de
 * PainelEmailAI de ser derrubado por statements que o `prisma migrate dev`
 * injeta sozinho. Ela já salvou sete migrations seguidas — mas até aqui NADA a
 * exercitava. Uma guarda que não é testada tem um modo de falha traiçoeiro:
 * ela para de casar (um reformat do AWK, um espaçamento diferente no SQL) e o
 * passo do CI continua VERDE. A proteção some sem sinal nenhum, e o próximo a
 * descobrir é produção — foi assim que o índice sumiu uma vez
 * (20260613120000_painel_email_fts_index_recreate).
 *
 * Exercita o script REAL, não uma cópia da regra: um teste que reimplementasse
 * o AWK em TypeScript passaria mesmo com o script quebrado, que é precisamente
 * o cenário contra o qual isto existe.
 */

const SCRIPT = join(process.cwd(), "scripts", "guarda-drift-fts.sh");

/** Monta um diretório de migrations temporário e roda a guarda contra ele. */
function rodarGuarda(arquivos: Record<string, string>): {
  code: number;
  saida: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "guarda-fts-"));
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

test("reprova DROP INDEX executável do índice FTS", () => {
  const { code, saida } = rodarGuarda({
    "20260101000000_x/migration.sql": 'DROP INDEX "PainelEmailAI_tsv_idx";\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /PainelEmailAI_tsv_idx/);
});

test("reprova ALTER COLUMN tsv DROP DEFAULT executável", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;\n',
  });
  assert.equal(code, 1);
});

test("aponta arquivo e linha do ofensor", () => {
  const { saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '-- cabeçalho\n-- outra linha\nDROP INDEX "PainelEmailAI_tsv_idx";\n',
  });
  // 3ª linha do arquivo — sem isso, achar o ofensor num diretório com 48
  // migrations vira caça manual.
  assert.match(saida, /migration\.sql:3:/);
});

// ── O caso que ela NÃO pode pegar ────────────────────────────────────────
// Toda migration da casa documenta a remoção em comentário. Se a guarda
// reprovasse comentário, o padrão inteiro do repositório ficaria vermelho e
// alguém desligaria a guarda — que é como uma proteção morre de verdade.

test("comentário citando o DROP passa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '--     DROP INDEX "PainelEmailAI_tsv_idx";\n' +
      '--     ALTER TABLE "PainelEmailAI" ALTER COLUMN "tsv" DROP DEFAULT;\n' +
      'ALTER TABLE "Parceiro" ADD COLUMN "x" TEXT;\n',
  });
  assert.equal(code, 0);
});

test("comentário indentado também passa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": '    --  DROP INDEX "PainelEmailAI_tsv_idx";\n',
  });
  assert.equal(code, 0);
});

test("ofensor executável NO MESMO arquivo que tem o comentário ainda reprova", () => {
  // O caso realista de esquecimento: a pessoa escreve o cabeçalho explicando
  // que removeu, e esquece de remover.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '-- REMOVIDOS À MÃO:\n' +
      '--     DROP INDEX "PainelEmailAI_tsv_idx";\n' +
      '\n' +
      'DROP INDEX "PainelEmailAI_tsv_idx";\n',
  });
  assert.equal(code, 1);
});

// ── Variações de forma que não podem escapar ─────────────────────────────

test("espaçamento extra entre DROP e INDEX não escapa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'DROP   INDEX  "PainelEmailAI_tsv_idx";\n',
  });
  assert.equal(code, 1);
});

test("IF EXISTS entre DROP INDEX e o nome não escapa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'DROP INDEX IF EXISTS "PainelEmailAI_tsv_idx";\n',
  });
  assert.equal(code, 1);
});

test("tsv sem aspas no ALTER COLUMN não escapa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "PainelEmailAI" ALTER COLUMN tsv DROP DEFAULT;\n',
  });
  assert.equal(code, 1);
});

test("acha o ofensor mesmo enterrado entre migrations limpas", () => {
  const { code, saida } = rodarGuarda({
    "20260101000000_a/migration.sql": 'ALTER TABLE "A" ADD COLUMN "x" TEXT;\n',
    "20260102000000_b/migration.sql": 'DROP INDEX "PainelEmailAI_tsv_idx";\n',
    "20260103000000_c/migration.sql": 'CREATE TABLE "C" ("id" TEXT NOT NULL);\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /20260102000000_b/);
});

// ── Casos de borda que não podem virar falso positivo ────────────────────

test("migration limpa passa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'CREATE TABLE "Parceiro" ("id" TEXT NOT NULL);\n' +
      'CREATE INDEX "Parceiro_nome_idx" ON "Parceiro"("nome");\n',
  });
  assert.equal(code, 0);
});

test("DROP INDEX de OUTRO índice passa", () => {
  // A guarda protege um índice específico; ela não pode virar uma proibição
  // geral de DROP INDEX, senão a PR de exclusividade (20260812055036, que
  // legitimamente troca um índice parcial) ficaria bloqueada.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'DROP INDEX "ParceiroCliente_vigente_key";\n',
  });
  assert.equal(code, 0);
});

test("recriar o índice FTS passa", () => {
  // 20260613120000 existe justamente para RECRIAR o índice; a guarda não pode
  // barrar o conserto.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'CREATE INDEX CONCURRENTLY "PainelEmailAI_tsv_idx" ON "PainelEmailAI" USING gin ("tsv");\n',
  });
  assert.equal(code, 0);
});

test("diretório sem nenhum .sql passa em vez de explodir", () => {
  const { code } = rodarGuarda({ "vazio/README.md": "sem sql aqui\n" });
  assert.equal(code, 0);
});

test("diretório inexistente sai com 2, distinguindo de 'limpo'", () => {
  // Se um caminho errado no ci.yml devolvesse 0, a guarda passaria a aprovar
  // tudo sem olhar nada — o pior desfecho possível para uma proteção.
  let code = -1;
  try {
    execFileSync(SCRIPT, [join(tmpdir(), "nao-existe-guarda-fts")], { encoding: "utf8" });
    code = 0;
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  assert.equal(code, 2);
});

// ── A guarda contra o próprio repositório ────────────────────────────────

test("as migrations REAIS do repositório passam na guarda", () => {
  const saida = execFileSync(SCRIPT, ["prisma/migrations"], { encoding: "utf8" });
  assert.match(saida, /^OK:/);
});
