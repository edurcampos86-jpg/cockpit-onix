/**
 * POST /api/juridico/contratos/[id]/reextrair
 *
 * Refaz a extração via Claude. Útil quando o resultado anterior falhou ou
 * quando o prompt foi atualizado. Adiciona uma nova ContratoExtracao no
 * histórico — não substitui a anterior.
 *
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { canEditContratos, canViewContrato } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { downloadContrato } from "@/lib/b2/upload";
import { rodarExtracao } from "@/lib/juridico";
import { logAcessoContrato, extrairRequestMeta } from "@/lib/juridico/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctxParams.params;

  // Re-extração precisa de podeEditar OU acesso ao contrato
  const podeEditar = await canEditContratos(ctx);
  const podeVer = await canViewContrato(ctx, id);
  if (!podeEditar && !podeVer) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id },
    select: { b2Key: true },
  });
  if (!contrato) {
    return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await downloadContrato(contrato.b2Key);
  } catch (e) {
    return NextResponse.json(
      { error: `Falha ao baixar do B2: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  await rodarExtracao(id, buffer);

  void logAcessoContrato({
    contratoArquivoId: id,
    usuarioId: ctx.userId,
    acao: "reextraiu",
    meta: extrairRequestMeta(req),
  });

  const ultima = await prisma.contratoExtracao.findFirst({
    where: { contratoArquivoId: id },
    orderBy: { extraidoEm: "desc" },
    select: {
      id: true,
      confianca: true,
      erroExtracao: true,
      dadosExtraidos: true,
    },
  });

  return NextResponse.json({ ok: true, extracao: ultima });
}
