/**
 * Lógica de backup do Postgres (dump -> B2 -> retenção -> registro).
 * Compartilhada pelo cron diário e pelo disparo manual — chamada DIRETA,
 * no mesmo processo, sem self-fetch HTTP (evita ERR_SSL_WRONG_VERSION_NUMBER).
 * Auth fica nas rotas; esta função NÃO autentica.
 */
import { prisma } from "@/lib/prisma";
import { b2BackupsConfigurado } from "@/lib/b2/client";
import { uploadBackup } from "@/lib/b2/backup";
import { rodarPgDump, lerEDescartarDump } from "@/lib/backup/postgres-dump";
import { aplicarRetencao } from "@/lib/backup/retention";
import { notify } from "@/lib/notify";

const PREFIX_POSTGRES = "postgres/";

export type BackupOutcome = { status: number; body: Record<string, unknown> };

export async function executarBackupBanco(): Promise<BackupOutcome> {
  if (!b2BackupsConfigurado()) {
    return {
      status: 503,
      body: { error: "B2 backups não configurado (B2_APPLICATION_KEY_ID_BACKUPS / B2_APPLICATION_KEY_BACKUPS / B2_ENDPOINT)" },
    };
  }

  const start = Date.now();
  const dump = await rodarPgDump();

  if (!dump.ok) {
    await prisma.backupExecucao.create({
      data: {
        tipo: "banco",
        destino: "FAILED",
        sucesso: false,
        erro: dump.erro,
        duracaoSegundos: Math.round((Date.now() - start) / 1000),
        metadata: { stderr: dump.stderr?.slice(0, 2000) ?? null },
      },
    });
    void notify({
      severity: "crit",
      title: "Backup FALHOU",
      body: `Erro: ${dump.erro}\n${dump.stderr?.slice(0, 500) ?? ""}`,
    });
    return { status: 500, body: { ok: false, erro: dump.erro } };
  }

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const key = `${PREFIX_POSTGRES}${yyyy}/${mm}/${dump.filename}`;

  let uploaded;
  try {
    const buffer = await lerEDescartarDump(dump.path);
    uploaded = await uploadBackup({
      key,
      body: buffer,
      contentType: "application/octet-stream",
      metadata: {
        "pg-dump-version": dump.pgDumpVersion.replace(/[^\w.\- ]/g, "_"),
        "duration-ms": String(dump.durationMs),
      },
    });
  } catch (e) {
    const err = e as Error;
    await prisma.backupExecucao.create({
      data: {
        tipo: "banco",
        destino: `b2://${key} (upload failed)`,
        tamanhoBytes: BigInt(dump.sizeBytes),
        sucesso: false,
        erro: err.message,
        duracaoSegundos: Math.round((Date.now() - start) / 1000),
      },
    });
    void notify({
      severity: "crit",
      title: "Backup — upload B2 falhou",
      body: `Dump OK (${(dump.sizeBytes / 1024 / 1024).toFixed(1)} MB) mas upload falhou: ${err.message}`,
    });
    return { status: 502, body: { ok: false, erro: err.message } };
  }

  const retencao = await aplicarRetencao(PREFIX_POSTGRES).catch((e) => {
    console.error("[backup] retencao falhou:", e);
    return { removidos: 0, mantidos: 0, erros: 1 };
  });

  await prisma.backupExecucao.create({
    data: {
      tipo: "banco",
      destino: `b2://${uploaded.bucket}/${uploaded.key}`,
      tamanhoBytes: BigInt(uploaded.size),
      sucesso: true,
      duracaoSegundos: Math.round((Date.now() - start) / 1000),
      metadata: { etag: uploaded.etag, pgDumpVersion: dump.pgDumpVersion, retencao },
    },
  });

  return {
    status: 200,
    body: {
      ok: true,
      filename: dump.filename,
      sizeBytes: uploaded.size,
      durationSeconds: Math.round((Date.now() - start) / 1000),
      key: uploaded.key,
      retencao,
    },
  };
}
