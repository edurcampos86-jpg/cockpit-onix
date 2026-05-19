/**
 * GET /api/cron/backup-restore-test
 *
 * Restore test mensal: baixa o último backup, restaura em DB temporário,
 * roda 3 sanity checks (counts), dropa o DB.
 *
 * Backup que não foi testado não é backup.
 *
 * Pré-requisito: o servidor Postgres tem que ter `CREATEDB` na role do
 * DATABASE_URL. Na Railway o user padrão tem essa permissão.
 */
import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { prisma } from "@/lib/prisma";
import { b2BackupsConfigurado } from "@/lib/b2/client";
import { listBackups, downloadBackup } from "@/lib/b2/backup";
import { notify } from "@/lib/notify";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;

  if (!b2BackupsConfigurado()) {
    return NextResponse.json({ error: "B2 backups não configurado" }, { status: 503 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "DATABASE_URL ausente" }, { status: 500 });
  }

  const start = Date.now();
  const testDbName = `cockpit_restore_test_${Date.now()}`;

  // Compor URL admin (sem nome de DB) e URL do DB temporário
  const url = new URL(process.env.DATABASE_URL);
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = "/postgres"; // conecta no DB admin pra criar/dropar
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${testDbName}`;

  let dumpPath: string | null = null;
  let dbCriado = false;

  try {
    // 1) Pegar último backup
    const backups = await listBackups("postgres/");
    if (backups.length === 0) {
      throw new Error("Nenhum backup encontrado em postgres/ — pular restore test");
    }
    backups.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    const ultimo = backups[0];

    // 2) Baixar localmente
    await mkdir("/tmp/onix-backups", { recursive: true });
    dumpPath = path.join("/tmp/onix-backups", `restore-test-${Date.now()}.dump`);
    const buf = await downloadBackup(ultimo.key);
    await writeFile(dumpPath, buf);

    // 3) Criar DB temporário
    await execAsync(`psql "${adminUrl.toString()}" -c 'CREATE DATABASE "${testDbName}"'`, {
      timeout: 30_000,
    });
    dbCriado = true;

    // 4) Restaurar
    await execAsync(
      `pg_restore --no-owner --no-acl --dbname="${testUrl.toString()}" "${dumpPath}"`,
      { timeout: 5 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 }
    );

    // 5) Sanity checks — usa psql pra rodar contagens isoladas (não tem Prisma client apontando pro DB temp)
    const counts: Record<string, number> = {};
    for (const tabela of ["User", "Pessoa", "ContratoArquivo"]) {
      try {
        const { stdout } = await execAsync(
          `psql "${testUrl.toString()}" -tAc 'SELECT count(*) FROM "${tabela}"'`,
          { timeout: 30_000 }
        );
        counts[tabela] = parseInt(stdout.trim(), 10);
      } catch (e) {
        counts[tabela] = -1; // tabela não existe ou sem permissão
      }
    }

    // Compara com counts do DB produção pra sanity
    const [usersProd, pessoasProd, contratosProd] = await Promise.all([
      prisma.user.count(),
      prisma.pessoa.count(),
      prisma.contratoArquivo.count(),
    ]);

    const sanityOk =
      counts.User > 0 &&
      Math.abs(counts.User - usersProd) <= 1 &&
      Math.abs(counts.Pessoa - pessoasProd) <= 1 &&
      Math.abs(counts.ContratoArquivo - contratosProd) <= 1;

    await prisma.backupExecucao.create({
      data: {
        tipo: "restore_test",
        destino: `b2://${ultimo.key} → temp db ${testDbName}`,
        tamanhoBytes: BigInt(ultimo.size),
        sucesso: sanityOk,
        duracaoSegundos: Math.round((Date.now() - start) / 1000),
        erro: sanityOk ? null : `Sanity check falhou — counts divergentes`,
        metadata: {
          backupKey: ultimo.key,
          backupAge: Math.round((Date.now() - ultimo.lastModified.getTime()) / 1000 / 3600) + "h",
          countsRestore: counts,
          countsProd: { User: usersProd, Pessoa: pessoasProd, ContratoArquivo: contratosProd },
        },
      },
    });

    if (!sanityOk) {
      void notify({
        severity: "crit",
        title: "Restore test FALHOU — sanity check",
        body: `Restore funcionou mas counts não casam.\nRestore: ${JSON.stringify(counts)}\nProd: User=${usersProd} Pessoa=${pessoasProd} Contrato=${contratosProd}`,
      });
    }

    return NextResponse.json({
      ok: true,
      sanityOk,
      counts,
      countsProd: { User: usersProd, Pessoa: pessoasProd, ContratoArquivo: contratosProd },
      backupKey: ultimo.key,
      durationSeconds: Math.round((Date.now() - start) / 1000),
    });
  } catch (e) {
    const err = e as Error;
    await prisma.backupExecucao.create({
      data: {
        tipo: "restore_test",
        destino: "FAILED",
        sucesso: false,
        erro: err.message,
        duracaoSegundos: Math.round((Date.now() - start) / 1000),
      },
    });
    void notify({
      severity: "crit",
      title: "Restore test FALHOU",
      body: `Erro: ${err.message}`,
    });
    return NextResponse.json({ ok: false, erro: err.message }, { status: 500 });
  } finally {
    if (dbCriado) {
      // Força disconnect (Postgres exige DROP fora do DB target)
      await execAsync(
        `psql "${adminUrl.toString()}" -c 'DROP DATABASE IF EXISTS "${testDbName}"'`,
        { timeout: 30_000 }
      ).catch((e) => console.error("[restore-test] falha ao dropar DB temp:", e));
    }
    if (dumpPath) {
      await unlink(dumpPath).catch(() => {});
    }
    void url;
  }
}
