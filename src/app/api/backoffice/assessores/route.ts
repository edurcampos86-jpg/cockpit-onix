import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const assessores = await prisma.pessoa.findMany({
      where: {
        cargoFamilia: "assessor_investimentos",
        status: "ativo",
      },
      select: {
        id: true,
        nomeCompleto: true,
        apelido: true,
        email: true,
      },
      orderBy: { nomeCompleto: "asc" },
    });
    return NextResponse.json({ assessores });
  } catch (error) {
    console.error("Erro ao listar assessores:", error);
    return NextResponse.json({ assessores: [] });
  }
}
