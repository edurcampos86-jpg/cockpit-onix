/**
 * POST /api/juridico/contratos/[id]/rejeitar
 *
 * Body: { observacoesRevisao: string }  (obrigatório explicar o motivo)
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { canApproveContratos } from "@/lib/auth/permissions";
import { rejeitarContrato } from "@/lib/juridico";
import { logAcessoContrato, extrairRequestMeta } from "@/lib/juridico/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !(await canApproveContratos(ctx))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctxParams.params;

  let body: { observacoesRevisao?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  if (!body.observacoesRevisao || body.observacoesRevisao.trim().length < 5) {
    return NextResponse.json(
      { error: "observacoesRevisao obrigatório (mínimo 5 caracteres)" },
      { status: 400 }
    );
  }

  const result = await rejeitarContrato({
    contratoArquivoId: id,
    revisadoPorId: ctx.userId,
    observacoesRevisao: body.observacoesRevisao,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.erro }, { status: result.status });
  }

  void logAcessoContrato({
    contratoArquivoId: id,
    usuarioId: ctx.userId,
    acao: "rejeitou",
    meta: extrairRequestMeta(req),
    extra: { motivo: body.observacoesRevisao },
  });

  return NextResponse.json({ ok: true });
}
