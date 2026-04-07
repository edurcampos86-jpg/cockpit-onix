import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const historias = await prisma.storyAnalogia.findMany({
      orderBy: [{ categoria: "asc" }, { criadoEm: "desc" }],
    });
    return NextResponse.json({ historias });
  } catch (error) {
    console.error("Erro listar histórias:", error);
    return NextResponse.json({ historias: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.titulo || !body.analogia) {
      return NextResponse.json({ error: "Título e analogia são obrigatórios" }, { status: 400 });
    }
    const historia = await prisma.storyAnalogia.create({
      data: {
        titulo: String(body.titulo),
        categoria: String(body.categoria || "outro"),
        analogia: String(body.analogia),
        quandoUsar: body.quandoUsar || null,
        tags: body.tags || null,
      },
    });
    return NextResponse.json(historia);
  } catch (error) {
    console.error("Erro criar história:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
