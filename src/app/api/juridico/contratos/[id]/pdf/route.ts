/**
 * GET /api/juridico/contratos/[id]/pdf
 *
 * Stream do PDF original do B2. SEM watermark (fase 1B adiciona).
 * Auth: admin. Apenas inline em browser — não promete proteção.
 *
 * ⚠️ Fase 1B vai trocar esse endpoint por um visualizador página-a-página
 *    em PNG com watermark dinâmico + audit log + 2FA gate. Por enquanto é
 *    só admin, single user (Eduardo), pra destravar a Fase 1A.
 */
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { downloadContrato } from "@/lib/b2/upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return new Response("forbidden", { status: 403 });
  }

  const { id } = await ctxParams.params;

  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id },
    select: { b2Key: true, nomeOriginal: true, mimeType: true },
  });
  if (!contrato) return new Response("Não encontrado", { status: 404 });

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadContrato(contrato.b2Key);
  } catch (e) {
    return new Response(`Falha ao baixar do B2: ${(e as Error).message}`, {
      status: 502,
    });
  }

  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      "Content-Type": contrato.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(contrato.nomeOriginal)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
