import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stalledOnly = searchParams.get("stalled") === "true";

  const where: Record<string, unknown> = { ativo: true };

  if (stalledOnly) {
    const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    where.ultimaAtividade = { lt: threshold };
  }

  const deals = await prisma.negocioPipeline.findMany({
    where,
    orderBy: { ultimaAtividade: stalledOnly ? "asc" : "desc" },
  });

  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (Array.isArray(body)) {
      const deals = await prisma.negocioPipeline.createManyAndReturn({
        data: body.map((d: Record<string, unknown>) => ({
          nomeCliente: d.nomeCliente as string,
          valor: d.valor as number,
          responsavel: d.responsavel as string,
          etapa: d.etapa as string,
          ultimaAtividade: new Date(d.ultimaAtividade as string),
          externalId: (d.externalId as string) ?? undefined,
        })),
      });
      return NextResponse.json(deals);
    }

    const { nomeCliente, valor, responsavel, etapa, ultimaAtividade, externalId } = body;

    if (!nomeCliente || valor == null || !responsavel || !etapa || !ultimaAtividade) {
      return NextResponse.json(
        { error: "Campos obrigatorios: nomeCliente, valor, responsavel, etapa, ultimaAtividade" },
        { status: 400 },
      );
    }

    const deal = await prisma.negocioPipeline.create({
      data: {
        nomeCliente,
        valor,
        responsavel,
        etapa,
        ultimaAtividade: new Date(ultimaAtividade),
        externalId: externalId ?? undefined,
      },
    });

    return NextResponse.json(deal);
  } catch (err) {
    console.error("[pipeline POST]", err);
    return NextResponse.json(
      { error: "Erro interno ao criar negocio" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...fields } = await req.json();

    if (!id) {
      return NextResponse.json(
        { error: "Campo obrigatorio: id" },
        { status: 400 },
      );
    }

    if (fields.ultimaAtividade) {
      fields.ultimaAtividade = new Date(fields.ultimaAtividade);
    }

    const deal = await prisma.negocioPipeline.update({
      where: { id },
      data: fields,
    });

    return NextResponse.json(deal);
  } catch (err) {
    console.error("[pipeline PATCH]", err);
    return NextResponse.json(
      { error: "Erro interno ao atualizar negocio" },
      { status: 500 },
    );
  }
}
