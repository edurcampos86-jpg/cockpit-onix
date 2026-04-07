import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const ALLOWED = [
  "visaoFamiliar",
  "objetivoPrincipal",
  "horizonteAnos",
  "perfilRisco",
  "alocacaoAlvo",
  "riscosPrincipais",
  "proximosPassos",
  "resumoExecutivo",
] as const;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    for (const k of ALLOWED) {
      if (k in body) {
        data[k] = k === "horizonteAnos" && body[k] != null ? Number(body[k]) : body[k];
      }
    }
    const plano = await prisma.planoUmaPagina.upsert({
      where: { clienteId: id },
      create: { clienteId: id, ...data },
      update: data,
    });
    return NextResponse.json(plano);
  } catch (error) {
    console.error("Erro plano:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
