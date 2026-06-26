import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import { downloadContrato } from "@/lib/b2/upload";

/**
 * GET /api/cockpit-reuniao/importacoes/[id]/pdf
 *
 * Baixa o PDF original de uma importação (do B2). 404 se o registro não existe
 * ou não tem arquivo armazenado (ex.: importado sem B2). Gate: autenticado +
 * flag COCKPIT_REUNIAO.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(await cockpitReuniaoHabilitado())) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  const { id } = await ctxParams.params;
  const imp = await prisma.reuniaoImport.findUnique({
    where: { id },
    select: { b2Key: true, nomeArquivo: true, contentType: true },
  });
  if (!imp || !imp.b2Key) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  let buf: Buffer;
  try {
    buf = await downloadContrato(imp.b2Key);
  } catch (err) {
    console.error("[cockpit-reuniao/importacoes/pdf] falha B2", err);
    return NextResponse.json({ error: "Falha ao baixar o PDF." }, { status: 502 });
  }

  const nome = (imp.nomeArquivo || "reuniao.pdf").replace(/[\r\n"]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": imp.contentType || "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Content-Length": String(buf.length),
    },
  });
}
