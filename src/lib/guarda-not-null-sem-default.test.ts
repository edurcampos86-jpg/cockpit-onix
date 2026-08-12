import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Teste da guarda de NOT NULL sem DEFAULT — scripts/guarda-not-null-sem-default.sh.
 *
 * POR QUE ESTE TESTE EXISTE: mesma razão de `guarda-drift-fts.test.ts`. Uma
 * guarda de CI que ninguém exercita tem um modo de falha traiçoeiro — ela para
 * de casar (um reformat do AWK, um espaçamento diferente no SQL) e o passo
 * continua VERDE. A proteção some sem sinal nenhum.
 *
 * Aqui isso é pior que no FTS: lá o estrago é um índice a recriar; aqui é o app
 * inteiro em loop de restart, porque o start é `migrate deploy && next start` e
 * o `&&` impede o `next start` quando a migration falha com 23502.
 *
 * Exercita o script REAL, não uma cópia da regra: um teste que reimplementasse
 * o AWK em TypeScript passaria mesmo com o script quebrado — precisamente o
 * cenário contra o qual isto existe.
 */

const SCRIPT = join(process.cwd(), "scripts", "guarda-not-null-sem-default.sh");

/** Monta um diretório de migrations temporário e roda a guarda contra ele. */
function rodarGuarda(arquivos: Record<string, string>): {
  code: number;
  saida: string;
} {
  const raiz = mkdtempSync(join(tmpdir(), "guarda-notnull-"));
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

// ── O caso que a guarda existe para pegar ──────────────────────────────────

test("reprova ADD COLUMN NOT NULL sem DEFAULT", () => {
  const { code, saida } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "Empresa" ADD COLUMN     "tipo" "TipoNo" NOT NULL;\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /NOT NULL sem DEFAULT/);
});

test("o SQL exato da PR #301 é pego", () => {
  // Copiado da migration da #301: duas colunas no mesmo ALTER TABLE, a
  // primeira sem DEFAULT (ofensora) e a segunda com (inofensiva).
  const { code, saida } = rodarGuarda({
    "20260810181603_empresa_tipo_e_transversal/migration.sql": `-- CreateEnum
CREATE TYPE "TipoNo" AS ENUM ('holding', 'empresa', 'departamento');

-- AlterTable
ALTER TABLE "Empresa" ADD COLUMN     "tipo" "TipoNo" NOT NULL,
ADD COLUMN     "transversal" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Empresa_transversal_idx" ON "Empresa"("transversal");
`,
  });
  assert.equal(code, 1);
  assert.match(saida, /"tipo"/);
  // A coluna COM default não pode ser reportada. A asserção mira a DECLARAÇÃO
  // dela (`"transversal" BOOLEAN`), não a palavra solta: o nome do diretório
  // da migration também contém "transversal", então um regex frouxo casaria
  // na linha do caminho e o teste passaria por acidente.
  assert.doesNotMatch(saida, /"transversal" BOOLEAN/);
  // Uma linha ofensora, não duas.
  assert.equal(saida.split("\n").filter((l) => l.includes("migration.sql:")).length, 1);
});

test("a mensagem ensina as duas saídas, não só reprova", () => {
  const { saida } = rodarGuarda({
    "20260101000000_x/migration.sql": 'ALTER TABLE "T" ADD COLUMN "x" TEXT NOT NULL;\n',
  });
  assert.match(saida, /DEFAULT 'valor'/); // saída (a)
  assert.match(saida, /SET NOT NULL/); // saída (b), o 3º passo do backfill
  assert.match(saida, /23502/); // o código do erro, para quem procurar depois
  assert.match(saida, /loop de restart/); // a consequência real
});

// ── O que NÃO pode reprovar ────────────────────────────────────────────────

test("CREATE TABLE com NOT NULL passa — a tabela nasce vazia", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": `CREATE TABLE "Nova" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    CONSTRAINT "Nova_pkey" PRIMARY KEY ("id")
);
`,
  });
  assert.equal(code, 0);
});

test("ADD COLUMN NOT NULL COM DEFAULT passa — é a saída recomendada", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      'ALTER TABLE "T" ADD COLUMN "x" BOOLEAN NOT NULL DEFAULT false;\n',
  });
  assert.equal(code, 0);
});

test("comentário citando o padrão passa", () => {
  // Uma migration pode DOCUMENTAR o perigo em comentário; só o statement
  // executável reprova. Mesma regra da guarda do FTS.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql":
      '-- Cuidado: ALTER TABLE "T" ADD COLUMN "x" TEXT NOT NULL derruba o app.\n',
  });
  assert.equal(code, 0);
});

test("backfill em três passos passa — nenhum dos passos é ofensor", () => {
  // O caminho que a própria mensagem de erro recomenda tem de passar na
  // guarda; se reprovasse, ela estaria mandando fazer o que ela mesma proíbe.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": `ALTER TABLE "T" ADD COLUMN "x" TEXT;
UPDATE "T" SET "x" = 'valor' WHERE "x" IS NULL;
ALTER TABLE "T" ALTER COLUMN "x" SET NOT NULL;
`,
  });
  assert.equal(code, 0);
});

test("SET NOT NULL isolado não é confundido com ADD COLUMN", () => {
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": 'ALTER TABLE "T" ALTER COLUMN "x" SET NOT NULL;\n',
  });
  assert.equal(code, 0);
});

// ── Estado e mecânica ──────────────────────────────────────────────────────

test("o `dentro` fecha no fim do statement — CREATE TABLE depois de ALTER passa", () => {
  // Regressão do rastreio de estado: se `dentro` não zerasse no `;`, o
  // CREATE TABLE seguinte herdaria o contexto do ALTER e reprovaria.
  const { code } = rodarGuarda({
    "20260101000000_x/migration.sql": `ALTER TABLE "T" ADD COLUMN "y" TEXT NOT NULL DEFAULT 'z';

CREATE TABLE "Outra" (
    "id" TEXT NOT NULL
);
`,
  });
  assert.equal(code, 0);
});

test("varre subdiretórios, não só o topo", () => {
  const { code, saida } = rodarGuarda({
    "a/b/migration.sql": 'ALTER TABLE "T" ADD COLUMN "x" TEXT NOT NULL;\n',
  });
  assert.equal(code, 1);
  assert.match(saida, /a\/b\/migration\.sql/);
});

test("diretório vazio passa em vez de quebrar", () => {
  const { code, saida } = rodarGuarda({});
  assert.equal(code, 0);
  assert.match(saida, /OK:/);
});

test("diretório inexistente sai com 2, distinto de 'limpo' e de 'ofensor'", () => {
  // Três códigos distintos importam: um caminho errado no ci.yml não pode
  // passar por "nenhum ofensor encontrado".
  let code = -1;
  try {
    execFileSync(SCRIPT, [join(tmpdir(), "nao-existe-guarda-notnull")], { encoding: "utf8" });
    code = 0;
  } catch (e) {
    code = (e as { status?: number }).status ?? -1;
  }
  assert.equal(code, 2);
});

// ── As migrations reais do repositório ─────────────────────────────────────

test("as migrations do repositório passam", () => {
  // Se esta falhar, ou entrou uma migration perigosa ou a guarda ficou
  // sensível demais. Nos dois casos é para parar e olhar.
  const saida = execFileSync(SCRIPT, ["prisma/migrations"], { encoding: "utf8" });
  assert.match(saida, /OK:/);
});
