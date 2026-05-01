// Idempotent migration: AcaoPainel.origem 'cockpit' -> 'local'.
// Roda contra o Postgres apontado por DATABASE_URL antes de deployar
// o codigo novo (que so reconhece "local"). Usa pg direto.

import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[migrate-origem-cockpit-to-local] DATABASE_URL not set, abortando");
  process.exit(1);
}

const client = new Client({ connectionString });

try {
  await client.connect();

  const before = await client.query(
    `SELECT origem, COUNT(*)::int AS total FROM "AcaoPainel" GROUP BY origem ORDER BY origem`
  );
  console.log("[migrate-origem-cockpit-to-local] antes:", before.rows);

  const res = await client.query(
    `UPDATE "AcaoPainel" SET origem = 'local' WHERE origem = 'cockpit'`
  );
  console.log(
    `[migrate-origem-cockpit-to-local] linhas atualizadas: ${res.rowCount ?? 0}`
  );

  const after = await client.query(
    `SELECT origem, COUNT(*)::int AS total FROM "AcaoPainel" GROUP BY origem ORDER BY origem`
  );
  console.log("[migrate-origem-cockpit-to-local] depois:", after.rows);
} catch (err) {
  if (err && typeof err === "object" && "code" in err && err.code === "42P01") {
    console.log("[migrate-origem-cockpit-to-local] tabela AcaoPainel nao existe, nada a fazer");
  } else {
    console.error("[migrate-origem-cockpit-to-local] FALHOU:", err);
    process.exit(1);
  }
} finally {
  await client.end().catch(() => {});
}
