/**
 * POST /api/admin/import-juridico-bulk
 *
 * Upload one-shot do ZIP da pasta 5.Jurídico (OneDrive). Processa
 * assíncrono em background — retorna jobId imediatamente. Cliente polla
 * /api/admin/import-juridico-bulk/[jobId]/status.
 *
 * Auth: admin (User.role === "admin").
 * Limite: 500 MB (ZIP).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { b2Configurado } from "@/lib/b2/client";
import { processarZip } from "@/lib/juridico/bulk-import";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // só pra receber e criar o job — processamento roda em background

const ZIP_MAX_BYTES = 500 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!b2Configurado()) {
    return NextResponse.json(
      { error: "B2 contratos não configurado — defina B2_APPLICATION_KEY_ID_CONTRATOS" },
      { status: 503 }
    );
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type deve ser multipart/form-data" },
      { status: 400 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao parsear form: ${(e as Error).message}` },
      { status: 400 }
    );
  }

  const file = form.get("zipFile");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo `zipFile` ausente" }, { status: 400 });
  }
  if (file.size > ZIP_MAX_BYTES) {
    return NextResponse.json(
      { error: `ZIP excede ${ZIP_MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 }
    );
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Arquivo deve ser .zip" }, { status: 400 });
  }

  const zipBuffer = Buffer.from(await file.arrayBuffer());

  const job = await prisma.importJob.create({
    data: {
      tipo: "juridico_zip",
      iniciadoPorId: ctx.userId,
      zipFilename: file.name,
      zipBytes: BigInt(zipBuffer.length),
      status: "running",
    },
    select: { id: true },
  });

  // Fire-and-forget — o processamento pode demorar minutos
  void processarZip({
    jobId: job.id,
    zipBuffer,
    uploadedById: ctx.userId,
  }).catch((e) => {
    console.error("[bulk-import] job falhou:", job.id, e);
    void prisma.importJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        finalizadoEm: new Date(),
        detalhes: [{ erro: (e as Error).message }],
      },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      jobId: job.id,
      mensagem:
        "Job criado. Polle GET /api/admin/import-juridico-bulk/" + job.id + "/status pra acompanhar.",
    },
    { status: 202 }
  );
}
