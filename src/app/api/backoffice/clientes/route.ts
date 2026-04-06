import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// Calcula cortes ABC: A = top 20%, B = próximos 30%, C = resto
function calcularCortesABC(saldos: number[]): { corteA: number; corteB: number } {
  if (saldos.length === 0) return { corteA: Infinity, corteB: Infinity };
  const ord = [...saldos].sort((x, y) => y - x);
  const idxA = Math.max(0, Math.floor(ord.length * 0.2) - 1);
  const idxB = Math.max(0, Math.floor(ord.length * 0.5) - 1);
  return { corteA: ord[idxA] ?? Infinity, corteB: ord[idxB] ?? Infinity };
}

export async function GET() {
  try {
    const clientes = await prisma.clienteBackoffice.findMany({
      orderBy: [{ classificacao: "asc" }, { saldo: "desc" }],
    });
    return NextResponse.json({ clientes, total: clientes.length });
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return NextResponse.json({ error: "Erro ao buscar clientes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientes } = body as {
      clientes: { nome: string; numeroConta: string; saldo: number }[];
    };

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return NextResponse.json({ error: "Nenhum dado recebido" }, { status: 400 });
    }

    const validClientes = clientes
      .map((c) => ({
        nome: String(c.nome || "").trim(),
        numeroConta: String(c.numeroConta || "").trim(),
        saldo:
          typeof c.saldo === "number"
            ? c.saldo
            : parseFloat(String(c.saldo).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
      }))
      .filter((c) => c.nome.length > 0);

    if (validClientes.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente valido encontrado. Verifique se a planilha tem coluna 'nome'." },
        { status: 400 }
      );
    }

    const { corteA, corteB } = calcularCortesABC(validClientes.map((c) => c.saldo));

    // Upsert por numeroConta — preserva dados de enriquecimento (contatos, metas, etc.)
    let criados = 0;
    let atualizados = 0;
    for (const c of validClientes) {
      const classificacao = c.saldo >= corteA ? "A" : c.saldo >= corteB ? "B" : "C";

      const existente = c.numeroConta
        ? await prisma.clienteBackoffice.findFirst({ where: { numeroConta: c.numeroConta } })
        : null;

      if (existente) {
        await prisma.clienteBackoffice.update({
          where: { id: existente.id },
          data: {
            nome: c.nome,
            saldo: c.saldo,
            ...(existente.classificacaoManual ? {} : { classificacao }),
          },
        });
        atualizados++;
      } else {
        await prisma.clienteBackoffice.create({
          data: {
            nome: c.nome,
            numeroConta: c.numeroConta,
            saldo: c.saldo,
            classificacao,
          },
        });
        criados++;
      }
    }

    return NextResponse.json({
      message: `${criados} criados, ${atualizados} atualizados. ABC recalculado.`,
      total: validClientes.length,
      criados,
      atualizados,
    });
  } catch (error) {
    console.error("Erro ao importar clientes:", error);
    return NextResponse.json({ error: "Erro ao processar dados" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.clienteBackoffice.deleteMany();
    return NextResponse.json({ message: "Dados removidos com sucesso" });
  } catch (error) {
    console.error("Erro ao remover clientes:", error);
    return NextResponse.json({ error: "Erro ao remover dados" }, { status: 500 });
  }
}
