/**
 * GET /api/juridico/contratos/[id]/pdf
 *
 * Stream do PDF com WATERMARK dinâmico aplicado in-memory pelo pdf-lib.
 * Cria um ContratoAcessoLog (acao: "visualizou") por request.
 *
 * Auth: usuário com canViewContrato + 2FA verificado nessa sessão.
 *
 * NÃO existe rota separada de "download bruto" — todo PDF que sai do servidor
 * tem watermark. Admin que precisar de PDF original baixa direto do B2 via
 * console Backblaze (audit lá fora do sistema).
 */
import { getAuthContext } from "@/lib/auth-helpers";
import { canViewContrato, isTwoFactorEnabled } from "@/lib/auth/permissions";
import { verificarSessao2FA } from "@/lib/auth/session-2fa";
import { prisma } from "@/lib/prisma";
import { downloadContrato } from "@/lib/b2/upload";
import { aplicarWatermark } from "@/lib/juridico/watermark";
import { logAcessoContrato, extrairRequestMeta } from "@/lib/juridico/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return new Response("forbidden", { status: 403 });

  const { id } = await ctxParams.params;

  // Gate 1: permissão de ver este contrato (carteira)
  if (!(await canViewContrato(ctx, id))) {
    return new Response("forbidden", { status: 403 });
  }

  // Gate 2: 2FA enabled + verificado nessa sessão
  const has2FA = await isTwoFactorEnabled(ctx.userId);
  if (has2FA && !(await verificarSessao2FA(ctx.userId))) {
    return new Response("2FA required", {
      status: 401,
      headers: { "X-2FA-Required": "1" },
    });
  }
  // Se o usuário ainda não tem 2FA configurado, redireciona pra setup
  if (!has2FA) {
    return new Response("2FA setup required", {
      status: 401,
      headers: { "X-2FA-Setup-Required": "1" },
    });
  }

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

  // Watermark in-memory
  let watermarked: Buffer;
  try {
    watermarked = await aplicarWatermark(pdfBuffer, {
      nomeUsuario: ctx.name,
      email: ctx.email || ctx.userId,
      ipAddress: extrairRequestMeta(req).ipAddress || "—",
      timestamp: new Date(),
    });
  } catch (e) {
    return new Response(`Falha ao aplicar watermark: ${(e as Error).message}`, {
      status: 500,
    });
  }

  // Audit log (fire-and-forget)
  void logAcessoContrato({
    contratoArquivoId: id,
    usuarioId: ctx.userId,
    acao: "visualizou",
    meta: extrairRequestMeta(req),
  });

  return new Response(new Uint8Array(watermarked), {
    headers: {
      "Content-Type": contrato.mimeType || "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(contrato.nomeOriginal)}"`,
      "Cache-Control": "private, no-store, no-cache, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      // Anti-embed externo: impede que outra origem ponha esse PDF num iframe
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "frame-ancestors 'self'",
    },
  });
}
