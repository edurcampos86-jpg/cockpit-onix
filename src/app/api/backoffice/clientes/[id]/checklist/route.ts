import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const BOOLS = [
  "testamento",
  "seguroVida",
  "planoSucessao",
  "reservaEmergencia",
  "planoSaude",
  "procuracao",
  "inventarioBens",
  "beneficiariosAtual",
  "declaracaoIR",
  "planejamentoTributario",
] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of BOOLS) if (k in body) data[k] = !!body[k];
    if ("notas" in body) data.notas = body.notas;

    const checklist = await prisma.checklistOrganizacao.upsert({
      where: { clienteId: id },
      create: { clienteId: id, ...data },
      update: data,
    });
    return NextResponse.json(checklist);
  } catch (error) {
    console.error("Erro checklist:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
