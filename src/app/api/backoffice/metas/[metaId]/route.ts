import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/backoffice/dado-interno";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ metaId: string }> }) {
  try {
    const { metaId } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ["titulo", "descricao", "categoria", "status"] as const) {
      if (k in body) data[k] = body[k];
    }
    if ("prazoData" in body) data.prazoData = body.prazoData ? new Date(body.prazoData) : null;
    if ("valorAlvo" in body) data.valorAlvo = body.valorAlvo != null ? Number(body.valorAlvo) : null;

    const meta = await prisma.metaCliente.update({ where: { id: metaId }, data });
    return NextResponse.json(meta);
  } catch (error) {
    console.error("Erro atualizar meta:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ metaId: string }> }) {
  /* Aberto a qualquer pessoa logada, por decisão — meta de cliente é dado interno,
   * criado e editado por quem trabalha aqui. Ver `lib/backoffice/dado-interno.ts`
   * para a regra inteira e por que ela está escrita em vez de implícita. */
  const semSessao = await exigirSessao();
  if (semSessao) return semSessao;

  try {
    const { metaId } = await params;
    await prisma.metaCliente.delete({ where: { id: metaId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro remover meta:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
