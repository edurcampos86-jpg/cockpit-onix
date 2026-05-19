/**
 * GET /api/cron/backup-daily
 *
 * Cron diário (Railway): dump do Postgres + upload no B2 + aplica retenção.
 * Notifica Slack/WhatsApp em caso de falha.
 *
 * Auth: Bearer CRON_SECRET (guardCron). Em dev, sem CRON_SECRET, libera.
 */
import { NextResponse } from "next/server";
import { guardCron } from "@/lib/painel-do-dia/cron-guard";
import { prisma } from "@/lib/prisma";
import { b2BackupsConfigurado } from "@/lib/b2/client";
import { uploadBackup } from "@/lib/b2/backup";
import { rodarPgDump, lerEDescartarDump } from "@/lib/backup/postgres-dump";
import { aplicarRetencao } from "@/lib/backup/retention";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600; // 10 min — dump pode demorar

const PREFIX_POSTGRES = "postgres/";

export async function GET(req: Request) {
  const blocked = guardCron(req);
  if (blocked) return blocked;

  if (!b2BackupsConfigurado()) {
    return NextResponse.json(
      { error: "B2 backups não configurado (B2_APPLICATION_KEY_ID_BACKUPS / B2_APPLICATION_KEY_BACKUPS / B2_ENDPOINT)" },
      { status: 503 }
    );
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
      title: "Backup diário FALHOU",
      body: `Erro: ${dump.erro}\n${dump.stderr?.slice(0, 500) ?? ""}`,
    });
    return NextResponse.json({ ok: false, erro: dump.erro }, { status: 500 });
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
      title: "Backup diário — upload B2 falhou",
      body: `Dump OK (${(dump.sizeBytes / 1024 / 1024).toFixed(1)} MB) mas upload falhou: ${err.message}`,
    });
    return NextResponse.json({ ok: false, erro: err.message }, { status: 502 });
  }

  // Aplicar retenção (best-effort — não falha o backup se a limpeza falhar)
  const retencao = await aplicarRetencao(PREFIX_POSTGRES).catch((e) => {
    console.error("[backup-daily] retencao falhou:", e);
    return { removidos: 0, mantidos: 0, erros: 1 };
  });

  await prisma.backupExecucao.create({
    data: {
      tipo: "banco",
      destino: `b2://${uploaded.bucket}/${uploaded.key}`,
      tamanhoBytes: BigInt(uploaded.size),
      sucesso: true,
      duracaoSegundos: Math.round((Date.now() - start) / 1000),
      metadata: {
        etag: uploaded.etag,
        pgDumpVersion: dump.pgDumpVersion,
        retencao,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    filename: dump.filename,
    sizeBytes: uploaded.size,
    durationSeconds: Math.round((Date.now() - start) / 1000),
    key: uploaded.key,
    retencao,
  });
}
