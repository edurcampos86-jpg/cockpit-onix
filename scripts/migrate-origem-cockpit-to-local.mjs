// One-shot + idempotente: migra AcaoPainel.origem de 'cockpit' para 'local'.
//
// Contexto: o produto foi renomeado de "Cockpit Onix" para "Ecossistema Onix".
// O valor literal 'cockpit' no campo `origem` (que distingue ações criadas
// dentro do app vs vindas de MS To Do / Priority Matrix) foi renomeado para
// 'local' — desliga o nome do produto do schema de dados.
//
// Quando rodar:
//   - ANTES (ou junto) com o deploy do código novo. Rodar contra o banco de
//     produção, depois pushar o código. Se inverter a ordem, ações antigas
//     ficam invisíveis no painel até o UPDATE rodar.
//
// Uso:
//   DATABASE_URL='postgres://...' node scripts/migrate-origem-cockpit-to-local.mjs
//
// Segurança: usa `pg` direto (já está em deps), não toca em outras tabelas,
// não tem efeitos colaterais, é idempotente (rodar 2x não muda nada após o 1º).

import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate-origem] DATABASE_URL não definido — abortando");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();

  const before = await client.query(
    `SELECT origem, COUNT(*)::int AS total FROM "AcaoPainel" GROUP BY origem ORDER BY origem`,
  );
  console.log("[migrate-origem] contagem ANTES:");
  for (const row of before.rows) console.log(`  ${row.origem.padEnd(20)} ${row.total}`);

  const update = await client.query(
    `UPDATE "AcaoPainel" SET origem = 'local' WHERE origem = 'cockpit'`,
  );
  console.log(`\n[migrate-origem] linhas atualizadas: ${update.rowCount}`);

  const after = await client.query(
    `SELECT origem, COUNT(*)::int AS total FROM "AcaoPainel" GROUP BY origem ORDER BY origem`,
  );
  console.log("\n[migrate-origem] contagem DEPOIS:");
  for (const row of after.rows) console.log(`  ${row.origem.padEnd(20)} ${row.total}`);

  const restantes = after.rows.find((r) => r.origem === "cockpit");
  if (restantes) {
    console.error(
      `\n[migrate-origem] ATENÇÃO: ainda restam ${restantes.total} linhas com origem='cockpit'`,
    );
    process.exit(2);
  }

  console.log("\n[migrate-origem] OK — nenhuma linha com origem='cockpit' restante");
} catch (err) {
  console.error("[migrate-origem] erro:", err);
  process.exit(1);
} finally {
  await client.end();
}
