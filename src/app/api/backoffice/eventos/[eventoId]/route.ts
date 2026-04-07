import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ eventoId: string }> }) {
  try {
    const { eventoId } = await params;
    await prisma.eventoVida.delete({ where: { id: eventoId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro remover evento:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
