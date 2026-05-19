/**
 * GET /api/admin/import-juridico-bulk/[jobId]/status
 *
 * Status do job de bulk import. Admin only.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctxParams: { params: Promise<{ jobId: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jobId } = await ctxParams.params;

  const job = await prisma.importJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return NextResponse.json({ error: "Job não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    tipo: job.tipo,
    status: job.status,
    totalArquivos: job.totalArquivos,
    processados: job.processados,
    sucessos: job.sucessos,
    erros: job.erros,
    pulados: job.pulados,
    iniciadoEm: job.iniciadoEm.toISOString(),
    finalizadoEm: job.finalizadoEm?.toISOString() ?? null,
    duracaoSegundos: job.duracaoSegundos,
    zipFilename: job.zipFilename,
    zipBytes: Number(job.zipBytes ?? 0),
    detalhes: job.detalhes,
    progresso:
      job.totalArquivos > 0
        ? Math.round((job.processados / job.totalArquivos) * 100)
        : 0,
  });
}
