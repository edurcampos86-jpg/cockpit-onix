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
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { downloadContrato } from "@/lib/b2/upload";
import { rodarExtracao } from "@/lib/juridico";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctxParams.params;

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
