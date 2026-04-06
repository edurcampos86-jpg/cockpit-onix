import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Cadência Supernova: 12 ligações + 4 reuniões + 2 revisões = 18 toques/ano para A
// B = 6 toques/ano, C = 2 toques/ano
function proximoContatoPor(classificacao: string): Date {
  const hoje = new Date();
  const diasPorClasse: Record<string, number> = {
    A: 30, // mensal
    B: 60, // bimestral
    C: 180, // semestral
  };
  const dias = diasPorClasse[classificacao] ?? 180;
  return new Date(hoje.getTime() + dias * 24 * 60 * 60 * 1000);
}

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

    // Atualiza último e próximo contato
    await prisma.clienteBackoffice.update({
      where: { id },
      data: {
        ultimoContatoAt: interacao.data,
        proximoContatoAt: proximoContatoPor(cliente.classificacao),
      },
    });

    return NextResponse.json(interacao);
  } catch (error) {
    console.error("Erro ao registrar interação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
