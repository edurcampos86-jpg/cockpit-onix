import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import {
  importarReuniaoEstruturada,
  type ImportarReuniaoInput,
} from "@/app/actions/reuniao-estruturada";
import { b2ContratosConfigurado } from "@/lib/b2/client";
import { uploadContrato } from "@/lib/b2/upload";

/**
 * POST /api/cockpit-reuniao/importar  (multipart/form-data)
 *
 * Salva a reunião importada (texto OU PDF) e registra o histórico
 * (ReuniaoImport). Quando vem PDF e o B2 está configurado, armazena o binário no
 * bucket de contratos e guarda a `b2Key`. Sem B2 (ex.: local), grava o registro
 * SEM o arquivo (best-effort) e avisa no retorno — a reunião é salva do mesmo jeito.
 *
 * Campos do form:
 *  - payload: JSON com os campos do preview (ImportarReuniaoInput sem metadados de arquivo)
 *  - file: PDF opcional (quando fonte=pdf)
 *
 * Gate: autenticado + flag COCKPIT_REUNIAO (OFF → 404).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await cockpitReuniaoHabilitado())) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Form inválido." }, { status: 400 });
  }

  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") {
    return NextResponse.json({ error: "Payload ausente." }, { status: 400 });
  }
  let campos: Partial<ImportarReuniaoInput>;
  try {
    campos = JSON.parse(payloadRaw) as Partial<ImportarReuniaoInput>;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }
  if (!campos || typeof campos.clienteId !== "string" || !campos.clienteId) {
    return NextResponse.json({ error: "Cliente não informado." }, { status: 400 });
  }

  // PDF opcional → upload best-effort.
  let fonte: "texto" | "pdf" = "texto";
  let nomeArquivo: string | null = null;
  let contentType: string | null = null;
  let tamanhoBytes: number | null = null;
  let b2Key: string | null = null;
  let pdfNaoArmazenado = false;

  const file = form.get("file");
  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.type !== "application/pdf") {
      return NextResponse.json({ error: "Só PDF é aceito." }, { status: 400 });
    }
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: "PDF vazio ou maior que 25 MB." },
        { status: 400 },
      );
    }
    fonte = "pdf";
    nomeArquivo = f.name || "reuniao.pdf";
    contentType = "application/pdf";
    tamanhoBytes = buf.length;

    if (b2ContratosConfigurado()) {
      const key = `reuniao-import/${campos.clienteId}/${randomUUID()}.pdf`;
      try {
        await uploadContrato({ key, body: buf, contentType: "application/pdf" });
        b2Key = key;
      } catch (err) {
        console.error("[cockpit-reuniao/importar] falha no upload B2", err);
        pdfNaoArmazenado = true; // segue salvando a reunião sem o arquivo
      }
    } else {
      pdfNaoArmazenado = true; // sem B2 (ex.: ambiente local)
    }
  }

  const input: ImportarReuniaoInput = {
    clienteId: campos.clienteId,
    pessoaId: campos.pessoaId ?? null,
    data: campos.data ?? null,
    tipoCadencia: campos.tipoCadencia ?? null,
    pautas: Array.isArray(campos.pautas) ? campos.pautas : [],
    pendenciasAssessor: Array.isArray(campos.pendenciasAssessor)
      ? campos.pendenciasAssessor
      : [],
    pendenciasCliente: Array.isArray(campos.pendenciasCliente)
      ? campos.pendenciasCliente
      : [],
    proximosPassos: Array.isArray(campos.proximosPassos) ? campos.proximosPassos : [],
    textoBruto: campos.textoBruto ?? null,
    patrimonioSnapshot: campos.patrimonioSnapshot ?? null,
    fonte,
    nomeArquivo,
    contentType,
    tamanhoBytes,
    b2Key,
  };

  const r = await importarReuniaoEstruturada(input);
  if (!r.ok) {
    return NextResponse.json({ error: r.error ?? "Falha ao salvar." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, pdfNaoArmazenado });
}
