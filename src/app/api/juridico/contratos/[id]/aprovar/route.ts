/**
 * POST /api/juridico/contratos/[id]/aprovar
 *
 * Body opcional: { pessoaId?, dadosCorrigidos?, observacoesRevisao? }
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { canApproveContratos } from "@/lib/auth/permissions";
import { aprovarContrato } from "@/lib/juridico";
import { logAcessoContrato, extrairRequestMeta } from "@/lib/juridico/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !(await canApproveContratos(ctx))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctxParams.params;

  let body: {
    pessoaId?: string;
    dadosCorrigidos?: Record<string, unknown>;
    observacoesRevisao?: string;
  } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const result = await aprovarContrato({
    contratoArquivoId: id,
    revisadoPorId: ctx.userId,
    pessoaId: body.pessoaId,
    dadosCorrigidos: body.dadosCorrigidos,
    observacoesRevisao: body.observacoesRevisao,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.erro }, { status: result.status });
  }

  void logAcessoContrato({
    contratoArquivoId: id,
    usuarioId: ctx.userId,
    acao: "aprovou",
    meta: extrairRequestMeta(req),
    extra: { observacoes: body.observacoesRevisao ?? null, pessoaId: body.pessoaId ?? null },
  });

  return NextResponse.json({ ok: true, novoKey: result.novoKey });
}
