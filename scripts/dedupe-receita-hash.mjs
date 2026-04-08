// One-shot + idempotent dedupe for ReceitaItem.hash duplicates.
// Must run BEFORE `prisma db push` so the UNIQUE(hash) constraint can be applied.
// Uses `pg` directly (already in prod dependencies) to avoid needing tsx/ts-node at runtime.

import pg from "pg";

const { Client } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[dedupe-receita-hash] DATABASE_URL not set, skipping");
  process.exit(0);
}

const client = new Client({ connectionString });

try {
  await client.connect();

  // Keep the OLDEST row per hash (lowest criadoEm); delete later duplicates.
  // Rows with hash IS NULL are untouched (NULLs don't collide on UNIQUE in Postgres).
  const res = await client.query(`
    DELETE FROM "ReceitaItem" a
    USING "ReceitaItem" b
    WHERE a.hash IS NOT NULL
      AND a.hash = b.hash
      AND a."criadoEm" > b."criadoEm"
  `);

  console.log(
    `[dedupe-receita-hash] removed ${res.rowCount ?? 0} duplicate row(s)`
  );
} catch (err) {
  // Table may not exist yet on a fresh DB — that's fine, db push will create it.
  if (err && typeof err === "object" && "code" in err && err.code === "42P01") {
    console.log("[dedupe-receita-hash] ReceitaItem table not found yet, skipping");
  } else {
    console.error("[dedupe-receita-hash] FAILED:", err);
    process.exit(1);
  }
} finally {
  await client.end().catch(() => {});
}
