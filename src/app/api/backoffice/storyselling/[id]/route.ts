import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ["titulo", "categoria", "analogia", "quandoUsar", "tags"] as const) {
      if (k in body) data[k] = body[k];
    }
    const historia = await prisma.storyAnalogia.update({ where: { id }, data });
    return NextResponse.json(historia);
  } catch (error) {
    console.error("Erro atualizar história:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.storyAnalogia.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro remover história:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
