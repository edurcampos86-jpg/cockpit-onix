/**
 * GET /api/admin/backups
 *
 * Lista histórico de BackupExecucao + status do B2 + último restore test.
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { b2BackupsConfigurado } from "@/lib/b2/client";
import { pgDumpAvailable } from "@/lib/backup/postgres-dump";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const [historico, ultimoBanco, ultimoRestoreTest, pgDump] = await Promise.all([
    prisma.backupExecucao.findMany({
      orderBy: { executadoEm: "desc" },
      take: 50,
      select: {
        id: true,
        tipo: true,
        destino: true,
        tamanhoBytes: true,
        sucesso: true,
        erro: true,
        duracaoSegundos: true,
        metadata: true,
        executadoEm: true,
      },
    }),
    prisma.backupExecucao.findFirst({
      where: { tipo: "banco", sucesso: true },
      orderBy: { executadoEm: "desc" },
      select: { executadoEm: true, tamanhoBytes: true, destino: true },
    }),
    prisma.backupExecucao.findFirst({
      where: { tipo: "restore_test" },
      orderBy: { executadoEm: "desc" },
      select: { executadoEm: true, sucesso: true, erro: true, metadata: true },
    }),
    pgDumpAvailable(),
  ]);

  return NextResponse.json({
    configuracao: {
      b2BackupsConfigurado: b2BackupsConfigurado(),
      pgDumpAvailable: pgDump.ok,
      pgDumpVersion: pgDump.version,
      pgDumpErro: pgDump.erro,
    },
    ultimoBanco: ultimoBanco
      ? {
          executadoEm: ultimoBanco.executadoEm.toISOString(),
          tamanhoBytes: Number(ultimoBanco.tamanhoBytes ?? 0),
          destino: ultimoBanco.destino,
          horasAtras: Math.round(
            (Date.now() - ultimoBanco.executadoEm.getTime()) / 1000 / 3600
          ),
        }
      : null,
    ultimoRestoreTest: ultimoRestoreTest
      ? {
          executadoEm: ultimoRestoreTest.executadoEm.toISOString(),
          sucesso: ultimoRestoreTest.sucesso,
          erro: ultimoRestoreTest.erro,
          metadata: ultimoRestoreTest.metadata,
          diasAtras: Math.round(
            (Date.now() - ultimoRestoreTest.executadoEm.getTime()) / 1000 / 86400
          ),
        }
      : null,
    historico: historico.map((h) => ({
      ...h,
      tamanhoBytes: Number(h.tamanhoBytes ?? 0),
      executadoEm: h.executadoEm.toISOString(),
    })),
  });
}
