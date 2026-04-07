import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED = [
  "valoresVida",
  "medos",
  "sonhos",
  "legado",
  "experienciaPrev",
  "linguagemPref",
  "mentorReferencia",
  "familiaSituacao",
  "perguntaMagica",
] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) data[k] = body[k];

    const perfil = await prisma.perfilDescoberta.upsert({
      where: { clienteId: id },
      create: { clienteId: id, ...data },
      update: data,
    });
    return NextResponse.json(perfil);
  } catch (error) {
    console.error("Erro descoberta:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
