import { test } from "node:test";
import assert from "node:assert/strict";
import { tabelasDeMigrations, ehMigrationSql } from "./tabelas-tocadas";

/* ── O CASO QUE MOTIVOU ────────────────────────────────────────────────── */

test("CREATE TABLE nova aparece — é a pergunta da PR de migration", () => {
  const sql = `CREATE TABLE "ParcelaReceita" ("id" TEXT NOT NULL);`;
  assert.deepEqual(tabelasDeMigrations([sql]), ["ParcelaReceita"]);
});

test("ALTER TABLE numa tabela EXISTENTE é o que mais importa destacar", () => {
  // Acrescentar coluna em tabela com 2,7 milhões de linhas não é o mesmo que
  // acrescentar em tabela vazia. É exatamente essa diferença que o destaque
  // existe para mostrar antes do merge.
  const sql = `ALTER TABLE "ClienteBackoffice" ADD COLUMN "novo" TEXT;`;
  assert.deepEqual(tabelasDeMigrations([sql]), ["ClienteBackoffice"]);
});

test("as sete formas de mexer numa tabela, todas reconhecidas", () => {
  const sql = `
    CREATE TABLE "A" ("id" TEXT);
    ALTER TABLE "B" ADD COLUMN "x" INT;
    DROP TABLE "C";
    TRUNCATE TABLE "D";
    INSERT INTO "E" ("id") VALUES ('1');
    UPDATE "F" SET "x" = 1;
    DELETE FROM "G" WHERE "x" = 1;
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["A", "B", "C", "D", "E", "F", "G"]);
});

test("CREATE INDEX conta — índice em tabela grande trava escrita enquanto constrói", () => {
  const sql = `CREATE UNIQUE INDEX "Parcela_chave_key" ON "ParcelaReceita"("contratoId");`;
  assert.deepEqual(tabelasDeMigrations([sql]), ["ParcelaReceita"]);
});

/* ── FALSO POSITIVO É PIOR QUE SILÊNCIO ────────────────────────────────── */

test("tabela citada só em COMENTÁRIO de linha não entra", () => {
  // Toda migration escrita com cuidado tem uma linha assim. Se ela contasse,
  // o destaque apontaria tabela que a PR não encosta — e destaque que erra
  // ensina a ignorar destaque.
  const sql = `
    -- DROP TABLE "NaoFacaIsso";
    CREATE TABLE "DeVerdade" ("id" TEXT);
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["DeVerdade"]);
});

test("tabela citada em comentário de BLOCO não entra, mesmo com -- dentro dele", () => {
  // O bloco sai primeiro justamente por isto: se o `--` fosse removido antes,
  // ele cortaria só a linha dele e o resto do bloco voltaria a valer.
  const sql = `
    /* histórico:
       -- antes era ALTER TABLE "Antiga"
       UPDATE "TambemAntiga" SET x = 1;
    */
    ALTER TABLE "Atual" ADD COLUMN "y" INT;
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["Atual"]);
});

/* ── FORMA DA SAÍDA ────────────────────────────────────────────────────── */

test("sem repetição e em ordem alfabética — o relatório não muda de forma à toa", () => {
  const sql = `
    ALTER TABLE "Zeta" ADD COLUMN "a" INT;
    ALTER TABLE "Alfa" ADD COLUMN "b" INT;
    ALTER TABLE "Zeta" ADD COLUMN "c" INT;
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["Alfa", "Zeta"]);
});

test("vários arquivos somam na mesma lista", () => {
  const a = `CREATE TABLE "Um" ("id" TEXT);`;
  const b = `CREATE TABLE "Dois" ("id" TEXT);`;
  assert.deepEqual(tabelasDeMigrations([a, b]), ["Dois", "Um"]);
});

test("PR sem migration devolve lista vazia, não erro", () => {
  assert.deepEqual(tabelasDeMigrations([]), []);
  assert.deepEqual(tabelasDeMigrations(["SELECT 1;"]), []);
});

test("os padrões são constantes de módulo — chamar duas vezes dá o mesmo resultado", () => {
  // Regex global guarda `lastIndex` entre chamadas de `exec`. Se o módulo
  // usasse `exec` em vez de `matchAll`, a SEGUNDA chamada perderia achados —
  // e em CI a segunda chamada é a que vale.
  const sql = `ALTER TABLE "Igual" ADD COLUMN "x" INT;`;
  assert.deepEqual(tabelasDeMigrations([sql]), tabelasDeMigrations([sql]));
});

test("minúsculas e maiúsculas no SQL, o mesmo achado", () => {
  assert.deepEqual(tabelasDeMigrations([`alter table "Caixa" add column "x" int;`]), ["Caixa"]);
});

/* ── QUAL ARQUIVO É MIGRATION ──────────────────────────────────────────── */

test("só o migration.sql do Prisma conta como migration", () => {
  assert.equal(ehMigrationSql("prisma/migrations/20260828_x/migration.sql"), true);
  assert.equal(ehMigrationSql("prisma/schema.prisma"), false);
  assert.equal(ehMigrationSql("scripts/algum.sql"), false);
  assert.equal(ehMigrationSql("prisma/migrations/20260828_x/outro.sql"), false);
});

/* ── FK PARA TABELA ANTIGA É TOCAR A TABELA ANTIGA ─────────────────────── */

test("REFERENCES traz a tabela apontada — ela leva lock e ganha gatilho", () => {
  // O caso que revelou a falta: uma migration puramente aditiva cria a tabela
  // nova e a única menção à antiga é o REFERENCES. Sem este padrão, o destaque
  // calava justamente sobre a tabela cuja contagem decidia a PR seguinte.
  const sql = `
    CREATE TABLE "ParcelaReceita" ("id" TEXT NOT NULL, "contratoId" TEXT);
    ALTER TABLE "ParcelaReceita" ADD CONSTRAINT "ParcelaReceita_contratoId_fkey"
      FOREIGN KEY ("contratoId") REFERENCES "ContratoCorretora"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["ContratoCorretora", "ParcelaReceita"]);
});

test("REFERENCES em comentário continua não contando", () => {
  const sql = `-- REFERENCES "Fantasma"("id")
    CREATE TABLE "Real" ("id" TEXT);`;
  assert.deepEqual(tabelasDeMigrations([sql]), ["Real"]);
});

test("auto-referência não duplica a tabela na lista", () => {
  const sql = `
    ALTER TABLE "Parceiro" ADD CONSTRAINT "p_fkey"
      FOREIGN KEY ("indicadoPorParceiroId") REFERENCES "Parceiro"("id");
  `;
  assert.deepEqual(tabelasDeMigrations([sql]), ["Parceiro"]);
});
