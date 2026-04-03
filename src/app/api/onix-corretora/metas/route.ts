import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const vendedor = searchParams.get("vendedor");

  const metas = await prisma.meta.findMany({
    where: vendedor ? { vendedor } : undefined,
    orderBy: [{ vendedor: "asc" }, { metrica: "asc" }],
  });

  return NextResponse.json(metas);
}

export async function POST(req: NextRequest) {
  try {
    const { vendedor, metrica, valor } = await req.json();
    if (!vendedor || !metrica || valor === undefined) {
      return NextResponse.json({ error: "vendedor, metrica e valor obrigatorios" }, { status: 400 });
    }

    const meta = await prisma.meta.upsert({
      where: { vendedor_metrica: { vendedor, metrica } },
      update: { valor: Number(valor) },
      create: { vendedor, metrica, valor: Number(valor) },
    });

    return NextResponse.json(meta);
  } catch (err) {
    console.error("[metas POST]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
