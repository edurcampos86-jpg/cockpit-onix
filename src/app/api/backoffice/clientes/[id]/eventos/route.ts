import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.titulo || !body.data) {
      return NextResponse.json({ error: "Título e data obrigatórios" }, { status: 400 });
    }
    const evento = await prisma.eventoVida.create({
      data: {
        clienteId: id,
        tipo: String(body.tipo || "outro"),
        titulo: String(body.titulo),
        data: new Date(body.data),
        recorrente: !!body.recorrente,
        lembrar: body.lembrar !== false,
        notas: body.notas || null,
      },
    });
    return NextResponse.json(evento);
  } catch (error) {
    console.error("Erro criar evento:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
