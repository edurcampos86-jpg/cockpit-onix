import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { proximoContatoPor } from "@/lib/cadencia";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const interacoes = await prisma.interacaoCliente.findMany({
      where: { clienteId: id },
      orderBy: { data: "desc" },
    });
    return NextResponse.json({ interacoes });
  } catch (error) {
    console.error("Erro ao listar interações:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();

    const cliente = await prisma.clienteBackoffice.findUnique({ where: { id } });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    const interacao = await prisma.interacaoCliente.create({
      data: {
        clienteId: id,
        tipo: String(body.tipo || "ligacao"),
        canal: body.canal || null,
        assunto: String(body.assunto || "Contato"),
        resumo: body.resumo || null,
        duracaoMin: body.duracaoMin ? Number(body.duracaoMin) : null,
        rcaNotas: body.rcaNotas || null,
        data: body.data ? new Date(body.data) : new Date(),
      },
    });

    // Atualiza último contato + próximo contato e, se for reunião, também a
    // última reunião (não regride se a data nova for anterior à atual).
    const updateData: {
      ultimoContatoAt: Date;
      proximoContatoAt: Date;
      ultimaReuniaoAt?: Date;
    } = {
      ultimoContatoAt: interacao.data,
      proximoContatoAt: proximoContatoPor(cliente.classificacao),
    };

    if (
      interacao.tipo === "reuniao" &&
      (!cliente.ultimaReuniaoAt || interacao.data > cliente.ultimaReuniaoAt)
    ) {
      updateData.ultimaReuniaoAt = interacao.data;
    }

    await prisma.clienteBackoffice.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(interacao);
  } catch (error) {
    console.error("Erro ao registrar interação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
