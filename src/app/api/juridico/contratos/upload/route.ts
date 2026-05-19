/**
 * POST /api/juridico/contratos/upload
 *
 * Recebe um PDF (multipart/form-data) e registra no cofre. Idempotente por
 * hash SHA-256 — re-upload do mesmo arquivo retorna o ID existente (status 409).
 *
 * Auth: admin. RBAC granular vem na Fase 1B.
 */
import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import {
  registrarUploadContrato,
  TAMANHO_MAXIMO_PDF_BYTES,
} from "@/lib/juridico";
import { b2Configurado } from "@/lib/b2/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!b2Configurado()) {
    return NextResponse.json(
      {
        error: "B2 não configurado",
        dica:
          "Defina B2_ENDPOINT, B2_APPLICATION_KEY_ID e B2_APPLICATION_KEY no Railway.",
      },
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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo `file` ausente" }, { status: 400 });
  }
  if (file.size > TAMANHO_MAXIMO_PDF_BYTES) {
    return NextResponse.json(
      { error: `Arquivo excede ${TAMANHO_MAXIMO_PDF_BYTES / 1024 / 1024}MB` },
      { status: 413 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pessoaIdRaw = form.get("pessoaId");
  const acordoIdRaw = form.get("acordoComercialId");
  const observacoesRaw = form.get("observacoes");

  const result = await registrarUploadContrato({
    buffer,
    nomeOriginal: file.name || "contrato.pdf",
    mimeType: file.type || "application/pdf",
    uploadedById: ctx.userId,
    pessoaId: typeof pessoaIdRaw === "string" && pessoaIdRaw ? pessoaIdRaw : null,
    acordoComercialId:
      typeof acordoIdRaw === "string" && acordoIdRaw ? acordoIdRaw : null,
    observacoes:
      typeof observacoesRaw === "string" && observacoesRaw ? observacoesRaw : null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.erro }, { status: result.status });
  }

  if (result.jaExistia) {
    return NextResponse.json(
      {
        ok: true,
        contratoArquivoId: result.contratoArquivoId,
        jaExistia: true,
        mensagem: result.mensagem,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      contratoArquivoId: result.contratoArquivoId,
      jaExistia: false,
      status: "processando_extracao",
    },
    { status: 201 }
  );
}
