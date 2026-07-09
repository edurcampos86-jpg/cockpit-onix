/**
 * GET /api/configuracoes/implementacoes/[id]/print
 *
 * Stream do print (imagem) de uma Implementação a partir do Backblaze B2.
 * `printUrl` guarda a KEY do objeto no bucket privado de contratos — não há URL
 * pública, então o acesso passa por aqui (sessão autenticada). Espelha o molde
 * de src/app/api/juridico/contratos/[id]/pdf/route.ts (sem watermark/2FA).
 *
 * A key e as credenciais B2 nunca são expostas na resposta nem no log.
 */
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { downloadContrato } from "@/lib/b2/upload";
import { mimeFromKey } from "@/lib/implementacoes/anexos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: Request,
  ctxParams: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return new Response("forbidden", { status: 403 });
  // Central de implementações é admin-only; não-admin recebe o MESMO 404 do
  // "não existe" (não vaza existência) — mesmo padrão da rota sugerir-rice.
  if (!isAdmin(ctx)) return new Response("Não encontrado", { status: 404 });

  const { id } = await ctxParams.params;

  const impl = await prisma.implementacao.findUnique({
    where: { id },
    select: { printUrl: true },
  });
  if (!impl || !impl.printUrl) {
    return new Response("Não encontrado", { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadContrato(impl.printUrl);
  } catch {
    // Não vaza a key nem detalhe do B2 na resposta.
    return new Response("Falha ao baixar o print", { status: 502 });
  }

  const contentType = mimeFromKey(impl.printUrl);
  const filename = `print-${id}.${impl.printUrl.split(".").pop() || "img"}`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
