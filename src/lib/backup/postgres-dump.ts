import "server-only";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat, unlink, mkdir, access } from "node:fs/promises";
import path from "node:path";

const execAsync = promisify(exec);

/**
 * Wrapper sobre `pg_dump` (binário do sistema). Gera um dump comprimido (gzip)
 * em /tmp e devolve o caminho + tamanho.
 *
 * ⚠️ Pré-requisito de runtime: o binário `pg_dump` precisa estar no PATH.
 * O Railway, por default (Nixpacks), NÃO inclui postgresql-client no runtime.
 * Para ativar, este projeto tem `nixpacks.toml` configurado com
 * `postgresql` em nixPkgs — isso instala pg_dump no container.
 *
 * Se rodar localmente: `brew install postgresql` ou `apt install postgresql-client`.
 *
 * Versão do pg_dump deve ser >= versão do servidor. Postgres do Railway hoje
 * é 16, então pg_dump 16+ é o mínimo.
 */

export async function pgDumpAvailable(): Promise<{ ok: boolean; version?: string; erro?: string }> {
  try {
    const { stdout } = await execAsync("pg_dump --version", { timeout: 5000 });
    return { ok: true, version: stdout.trim() };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export type DumpResult = {
  ok: true;
  path: string;
  filename: string;
  sizeBytes: number;
  durationMs: number;
  pgDumpVersion: string;
};

export type DumpFailure = {
  ok: false;
  erro: string;
  stderr?: string;
};

/**
 * Roda pg_dump --format=custom --compress=9 contra a DATABASE_URL.
 * Custom format é mais portável que SQL puro (compress nativo + ordering).
 * Para restore: pg_restore -d <target_db> <file>.
 */
export async function rodarPgDump(opts?: { databaseUrl?: string }): Promise<DumpResult | DumpFailure> {
  const url = opts?.databaseUrl || process.env.DATABASE_URL;
  if (!url) {
    return { ok: false, erro: "DATABASE_URL ausente" };
  }

  const versao = await pgDumpAvailable();
  if (!versao.ok) {
    return {
      ok: false,
      erro: `pg_dump não disponível no PATH. ${versao.erro}. Configure nixpacks.toml com postgresql nos nixPkgs.`,
    };
  }

  await mkdir("/tmp/onix-backups", { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `postgres-${ts}.dump`;
  const filepath = path.join("/tmp/onix-backups", filename);

  const start = Date.now();
  try {
    // --format=custom = formato binário do pg, restore-able com pg_restore
    // --compress=9   = compressão máxima (mais CPU, menos rede)
    // --no-owner --no-acl = portabilidade entre databases com nomes/roles diferentes
    // --quote-all-identifiers = case-sensitive safety
    await execAsync(
      `pg_dump --format=custom --compress=9 --no-owner --no-acl --quote-all-identifiers --file="${filepath}" "${url}"`,
      {
        timeout: 10 * 60 * 1000, // 10 min hard limit
        maxBuffer: 50 * 1024 * 1024,
      }
    );
  } catch (e) {
    const err = e as { message: string; stderr?: string };
    return {
      ok: false,
      erro: err.message,
      stderr: err.stderr,
    };
  }

  try {
    await access(filepath);
  } catch {
    return { ok: false, erro: "pg_dump rodou mas o arquivo não foi criado" };
  }

  const stats = await stat(filepath);
  return {
    ok: true,
    path: filepath,
    filename,
    sizeBytes: stats.size,
    durationMs: Date.now() - start,
    pgDumpVersion: versao.version || "?",
  };
}

/** Lê o dump em Buffer e remove o tmp file. */
export async function lerEDescartarDump(filepath: string): Promise<Buffer> {
  const buffer = await readFile(filepath);
  await unlink(filepath).catch(() => {});
  return buffer;
}
