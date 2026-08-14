import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste da guarda de NOT NULL sem DEFAULT — scripts/guarda-not-null-sem-default.sh.
 *
 * POR QUE ESTE TESTE EXISTE: a guarda impede que uma migration acrescente
 * coluna obrigatória sem default a uma tabela com linhas. O efeito de escapar
 * não é "migration pendente": o start do serviço é
 * `prisma migrate deploy && next start`, e o `&&` derruba o APP em loop de
 * restart quando o Postgres recusa com 23502.
 *
 * Exercita o script REAL, no mesmo padrão de `guarda-drift-fts.test.ts`: um
 * teste que reimplementasse o AWK em TypeScript passaria mesmo com o script
 * quebrado — que é precisamente o cenário contra o qual isto existe.
 */

const SCRIPT = join(process.cwd(), "scripts", "guarda-not-null-sem-default.sh");

/** Monta um diretório de migrations temporário e roda a guarda contra ele. */
function rodarGuarda(arquivos: Record<string, string>): {
  code: number;
  saida: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "guarda-nn-"));
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

test("reprova ADD COLUMN NOT NULL sem DEFAULT", () => {
  // O SQL literal da #301, que motivou a guarda.
  const { code, saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" "TipoNo" NOT NULL;\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /NOT NULL sem DEFAULT/);
});

test("aponta arquivo e linha do ofensor", () => {
  const { saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      "-- cabeçalho\n" +
      "-- outra linha\n" +
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT NOT NULL;\n',
  });
  // Sem arquivo:linha, achar o ofensor num diretório com 49 migrations vira
  // caça manual.
  assert.match(saida, /migration\.sql:3:/);
});

test("aponta SÓ a linha ofensora, não o arquivo inteiro", () => {
  // O caso realista: uma migration mistura coluna com DEFAULT, CREATE TABLE e
  // a linha errada. Guarda que despeja o arquivo todo não ajuda ninguém.
  const { code, saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "A" ADD COLUMN "ok" BOOLEAN NOT NULL DEFAULT true;\n' +
      'CREATE TABLE "Nova" ("id" TEXT NOT NULL);\n' +
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT NOT NULL;\n',
  });
  assert.equal(code, 1);
  const linhas = saida.split("\n").filter((l) => /migration\.sql:\d+:/.test(l));
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /migration\.sql:3:/);
});

test("a mensagem ensina as duas saídas", () => {
  // Reprovar sem dizer o que fazer transforma a guarda em obstáculo: quem
  // esbarra nela contorna, e a próxima coluna sem default passa por outro
  // caminho.
  const { saida } = rodarGuarda({
    "20260101000000_x/migration.sql": 'ALTER TABLE "A" ADD COLUMN "x" TEXT NOT NULL;\n',
  });
  assert.match(saida, /DEFAULT 'valor'/);
  assert.match(saida, /SET NOT NULL/);
  assert.match(saida, /23502/);
});

test("acha o ofensor mesmo enterrado entre migrations limpas", () => {
  const { code, saida } = rodarGuarda({
    "20260101000000_a/migration.sql": 'ALTER TABLE "A" ADD COLUMN "x" TEXT;\n',
    "20260102000000_b/migration.sql": 'ALTER TABLE "B" ADD COLUMN "y" TEXT NOT NULL;\n',
    "20260103000000_c/migration.sql": 'CREATE TABLE "C" ("id" TEXT NOT NULL);\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /20260102000000_b/);
});

// ── Os falsos positivos que não podem acontecer ──────────────────────────
// Guarda que reprova o padrão correto é guarda que alguém desliga.

test("ADD COLUMN NOT NULL DEFAULT passa", () => {
  // É justamente a saída recomendada pela própria mensagem de erro.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;\n',
  });
  assert.equal(code, 0);
});

test("CREATE TABLE com NOT NULL passa", () => {
  // Tabela nova nasce vazia: não há linha para violar a constraint. Reprovar
  // aqui bloquearia toda migration de modelo novo do repositório.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'CREATE TABLE "Parceiro" (\n' +
      '    "id" TEXT NOT NULL,\n' +
      '    "nome" TEXT NOT NULL,\n' +
      '    CONSTRAINT "Parceiro_pkey" PRIMARY KEY ("id")\n' +
      ");\n",
  });
  assert.equal(code, 0);
});

test("comentário citando o padrão passa", () => {
  // Mesma regra da guarda do FTS: as migrations da casa documentam decisões
  // em comentário, e o padrão inteiro do repositório ficaria vermelho.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '--     ALTER TABLE "Empresa" ADD COLUMN "tipo" "TipoNo" NOT NULL;\n' +
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT;\n',
  });
  assert.equal(code, 0);
});

test("comentário indentado também passa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '    --  ADD COLUMN "tipo" "TipoNo" NOT NULL;\n',
  });
  assert.equal(code, 0);
});

test("ADD COLUMN nullable passa", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT;\n',
  });
  assert.equal(code, 0);
});

test("ALTER COLUMN SET NOT NULL passa", () => {
  // O passo 3 do backfill que a própria mensagem recomenda. Se a guarda
  // reprovasse isto, ela proibiria a saída que ela mesma ensina.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT;\n' +
      'UPDATE "Empresa" SET "tipo" = \'empresa\';\n' +
      'ALTER TABLE "Empresa" ALTER COLUMN "tipo" SET NOT NULL;\n',
  });
  assert.equal(code, 0);
});

// ── Variações de forma que não podem escapar ─────────────────────────────

test("espaçamento extra entre ADD e COLUMN não escapa", () => {
  // O Prisma gera exatamente assim: `ADD COLUMN     "x"`.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN     "tipo"   TEXT   NOT   NULL;\n',
  });
  assert.equal(code, 1);
});

test("minúsculas não escapam", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'alter table "Empresa" add column "tipo" text not null;\n',
  });
  assert.equal(code, 1);
});

test("segunda coluna de um ALTER TABLE multilinha não escapa", () => {
  // O Prisma quebra ALTER TABLE com várias colunas em uma linha por ADD
  // COLUMN, e a segunda NÃO repete `ALTER TABLE`. Sem o estado `dentro` do
  // awk, esta linha passaria — e é a forma mais comum de o erro entrar.
  const { code, saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN     "a" TEXT NOT NULL DEFAULT \'\',\n' +
      'ADD COLUMN     "b" TEXT NOT NULL;\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /migration\.sql:2:/);
});

test("NOT NULL de um CREATE TABLE depois de um ALTER TABLE fechado não vira falso positivo", () => {
  // O `;` fecha o statement e desarma o estado. Sem isso, todo CREATE TABLE
  // que viesse depois de um ALTER TABLE seria lido como continuação dele.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN "tipo" TEXT;\n' +
      'CREATE TABLE "Nova" (\n' +
      '    "id" TEXT NOT NULL\n' +
      ");\n",
  });
  assert.equal(code, 0);
});

// ── Casos de borda ───────────────────────────────────────────────────────

test("diretório sem nenhum .sql passa em vez de explodir", () => {
  const { code } = rodarGuarda({ "vazio/README.md": "sem sql aqui\n" });
  assert.equal(code, 0);
});

test("diretório inexistente sai com 2, distinguindo de 'limpo'", () => {
  // Se um caminho errado no ci.yml devolvesse 0, a guarda passaria a aprovar
  // tudo sem olhar nada — o pior desfecho possível para uma proteção.
  let code = -1;
  try {
    execFileSync(SCRIPT, [join(tmpdir(), "nao-existe-guarda-nn")], { encoding: "utf8" });
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
