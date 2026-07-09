/**
 * GET /api/configuracoes/implementacoes/anexos/[anexoId]
 *
 * Stream de um anexo (imagem/PDF) de uma sugestão de Implementação a partir do
 * Backblaze B2. A linha ImplementacaoAnexo guarda a KEY (b2Key) e o contentType;
 * o bucket é privado, então o acesso passa por aqui (sessão autenticada).
 * Espelha o molde da rota legada de print (sem watermark/2FA).
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
  ctxParams: { params: Promise<{ anexoId: string }> },
) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return new Response("forbidden", { status: 403 });
  // Central de implementações é admin-only; não-admin recebe o MESMO 404 do
  // "não existe" (não vaza existência) — mesmo padrão da rota sugerir-rice.
  if (!isAdmin(ctx)) return new Response("Não encontrado", { status: 404 });

  const { anexoId } = await ctxParams.params;

  const anexo = await prisma.implementacaoAnexo.findUnique({
    where: { id: anexoId },
    select: { b2Key: true, contentType: true, nomeArquivo: true },
  });
  if (!anexo) {
    return new Response("Não encontrado", { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadContrato(anexo.b2Key);
  } catch {
    // Não vaza a key nem detalhe do B2 na resposta.
    return new Response("Falha ao baixar o anexo", { status: 502 });
  }

  // Preferimos o contentType salvo na linha; mimeFromKey é fallback.
  const contentType = anexo.contentType || mimeFromKey(anexo.b2Key);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(anexo.nomeArquivo)}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
