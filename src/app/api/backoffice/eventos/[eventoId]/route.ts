import { prisma } from "@/lib/prisma";
import { exigirSessao } from "@/lib/backoffice/dado-interno";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventoId: string }> }) {
  /* Aberto a qualquer pessoa logada, por decisão — evento de vida é dado interno,
   * criado e editado por quem trabalha aqui. Ver `lib/backoffice/dado-interno.ts`
   * para a regra inteira e por que ela está escrita em vez de implícita. */
  const semSessao = await exigirSessao();
  if (semSessao) return semSessao;

  try {
    const { eventoId } = await params;
    await prisma.eventoVida.delete({ where: { id: eventoId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro remover evento:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
