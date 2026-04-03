import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vendedor = searchParams.get("vendedor");

  const relatorios = await prisma.relatorio.findMany({
    where: vendedor ? { vendedor } : undefined,
    orderBy: { periodoInicio: "desc" },
    include: {
      acoes: { select: { id: true, concluida: true } },
      metricas: { select: { conversasAnalisadas: true, conversasSemResposta: true, reunioesAgendadas: true, leadsPerdidos: true, score: true } },
    },
  });

  return NextResponse.json(relatorios);
}
