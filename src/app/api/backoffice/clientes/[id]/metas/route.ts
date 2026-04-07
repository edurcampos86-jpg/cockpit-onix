import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.titulo) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    const meta = await prisma.metaCliente.create({
      data: {
        clienteId: id,
        titulo: body.titulo,
        descricao: body.descricao ?? null,
        prazoData: body.prazoData ? new Date(body.prazoData) : null,
        valorAlvo: body.valorAlvo != null ? Number(body.valorAlvo) : null,
        categoria: body.categoria ?? null,
        status: body.status ?? "ativa",
      },
    });
    return NextResponse.json(meta);
  } catch (error) {
    console.error("Erro criar meta:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
