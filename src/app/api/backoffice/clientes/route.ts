import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

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
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Planilha vazia" }, { status: 400 });
    }

    // Map columns flexibly (accept various header names)
    const clientes = rows.map((row) => {
      const nome = String(
        row["nome"] ?? row["Nome"] ?? row["NOME"] ?? row["name"] ?? row["Name"] ?? ""
      ).trim();

      const numeroConta = String(
        row["numero_conta"] ?? row["numeroConta"] ?? row["Numero da Conta"] ??
        row["conta"] ?? row["Conta"] ?? row["CONTA"] ?? row["account"] ??
        row["numero conta"] ?? row["Número da Conta"] ?? row["N Conta"] ?? ""
      ).trim();

      const saldoRaw =
        row["saldo"] ?? row["Saldo"] ?? row["SALDO"] ?? row["balance"] ?? row["Balance"] ?? 0;
      const saldo = typeof saldoRaw === "number" ? saldoRaw : parseFloat(String(saldoRaw).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

      return { nome, numeroConta, saldo };
    });

    // Filter out rows with empty name
    const validClientes = clientes.filter((c) => c.nome.length > 0);

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
    return NextResponse.json({ error: "Erro ao processar arquivo" }, { status: 500 });
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
