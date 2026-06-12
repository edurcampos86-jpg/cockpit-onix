/**
 * POST /api/automation/import-saldo-cc
 * Import do XLSX "Saldo em CC" pra automação (Cowork) — multipart com campo
 * `file`, parse server-side via xlsx-mapping compartilhado, update-only.
 *
 * Auth: Bearer IMPORT_XLSX_TOKEN (env Railway). Sem env = endpoint
 * DESATIVADO (503) — postura inversa do guardCron de propósito: rota que
 * MUTA dados de cliente não abre sozinha em ambiente sem config.
 * GET/DELETE de clientes continuam exigindo sessão admin.
 */
import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { importarSaldoCcDeXlsx } from "@/lib/backoffice/import-saldo-cc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BYTES = 15 * 1024 * 1024; // Saldo em CC real tem ~2.600 linhas × 4 colunas

function tokensIguais(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function guardImportToken(req: Request): NextResponse | null {
  const esperado = process.env.IMPORT_XLSX_TOKEN?.trim();
  if (!esperado) {
    return NextResponse.json(
      { error: "Import automático desativado (IMPORT_XLSX_TOKEN não configurado)." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization");
  const recebido = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!recebido || !tokensIguais(recebido, esperado)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  const blocked = guardImportToken(req);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Esperava multipart/form-data com o campo `file` (.xlsx)." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo `file` ausente ou inválido." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Arquivo vazio." }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Arquivo acima de 15MB." }, { status: 413 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const resultado = await importarSaldoCcDeXlsx(buffer);
    return NextResponse.json(resultado, { status: resultado.status });
  } catch (error) {
    console.error("[POST /automation/import-saldo-cc] erro:", error);
    return NextResponse.json(
      { error: "Falha ao processar o arquivo (formato .xlsx válido?)." },
      { status: 500 },
    );
  }
}
