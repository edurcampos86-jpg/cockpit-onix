/**
 * POST /api/juridico/contratos/[id]/log-tentativa
 *
 * Logado pelo client quando o usuário tenta usar Ctrl+P, F12, PrintScreen ou
 * outras teclas suspeitas no visualizador. Não impede a ação (impossível
 * de garantir 100%), mas deixa rastro pra auditoria.
 *
 * Body: { tipo: "tentou_imprimir" | "tentou_baixar", contexto?: any }
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { canViewContrato } from "@/lib/auth/permissions";
import { logAcessoContrato, extrairRequestMeta, type AcaoContrato } from "@/lib/juridico/audit";

export const dynamic = "force-dynamic";

const ACOES_PERMITIDAS: AcaoContrato[] = ["tentou_imprimir", "tentou_baixar"];

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctxParams.params;

  // Não bloqueamos se podeVer for false — o log ainda é útil
  await canViewContrato(ctx, id);

  let body: { tipo?: string; contexto?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const acao = (body.tipo as AcaoContrato) ?? "tentou_imprimir";
  if (!ACOES_PERMITIDAS.includes(acao)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  }

  void logAcessoContrato({
    contratoArquivoId: id,
    usuarioId: ctx.userId,
    acao,
    meta: extrairRequestMeta(req),
    extra: typeof body.contexto === "object" ? (body.contexto as Record<string, unknown>) : undefined,
  });

  return NextResponse.json({ ok: true });
}
