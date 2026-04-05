import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const now = new Date();
  const mes = Number(searchParams.get("mes") ?? now.getMonth() + 1);
  const ano = Number(searchParams.get("ano") ?? now.getFullYear());

  const meta = await prisma.metaMensal.findUnique({
    where: { mes_ano: { mes, ano } },
  });

  if (!meta) {
    return NextResponse.json(
      { message: "Sem meta definida para este mes" },
      { status: 404 },
    );
  }

  return NextResponse.json(meta);
}

export async function POST(req: NextRequest) {
  try {
    const { mes, ano, metaFaturamento, faturamentoAtual } = await req.json();

    if (!mes || !ano || metaFaturamento == null) {
      return NextResponse.json(
        { error: "Campos obrigatorios: mes, ano, metaFaturamento" },
        { status: 400 },
      );
    }

    if (mes < 1 || mes > 12) {
      return NextResponse.json(
        { error: "Mes deve ser entre 1 e 12" },
        { status: 400 },
      );
    }

    const meta = await prisma.metaMensal.upsert({
      where: { mes_ano: { mes, ano } },
      create: {
        mes,
        ano,
        metaFaturamento,
        faturamentoAtual: faturamentoAtual ?? 0,
      },
      update: {
        metaFaturamento,
        ...(faturamentoAtual != null ? { faturamentoAtual } : {}),
      },
    });

    return NextResponse.json(meta);
  } catch (err) {
    console.error("[metas-mensais POST]", err);
    return NextResponse.json(
      { error: "Erro interno ao salvar meta" },
      { status: 500 },
    );
  }
}
