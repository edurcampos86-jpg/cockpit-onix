import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const clientes = await prisma.clienteBackoffice.findMany({
      orderBy: { nome: "asc" },
    });
    const total = clientes.length;
    return NextResponse.json({ clientes, total });
  } catch (error) {
    console.error("Erro ao buscar clientes:", error);
    return NextResponse.json({ error: "Erro ao buscar clientes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clientes } = body as { clientes: { nome: string; numeroConta: string; saldo: number }[] };

    if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
      return NextResponse.json({ error: "Nenhum dado recebido" }, { status: 400 });
    }

    const validClientes = clientes
      .map((c) => ({
        nome: String(c.nome || "").trim(),
        numeroConta: String(c.numeroConta || "").trim(),
        saldo: typeof c.saldo === "number" ? c.saldo : parseFloat(String(c.saldo).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0,
      }))
      .filter((c) => c.nome.length > 0);

    if (validClientes.length === 0) {
      return NextResponse.json(
        { error: "Nenhum cliente valido encontrado. Verifique se a planilha tem coluna 'nome'." },
        { status: 400 }
      );
    }

    // Clear existing data and insert new
    await prisma.clienteBackoffice.deleteMany();
    await prisma.clienteBackoffice.createMany({ data: validClientes });

    return NextResponse.json({
      message: `${validClientes.length} clientes importados com sucesso`,
      total: validClientes.length,
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
