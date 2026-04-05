import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── GET: listar execuções de um mês ──────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mes = parseInt(searchParams.get("mes") ?? String(new Date().getMonth()));
  const ano = parseInt(searchParams.get("ano") ?? String(new Date().getFullYear()));

  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0, 23, 59, 59);

  const execucoes = await prisma.ritualExecucao.findMany({
    where: { data: { gte: inicio, lte: fim } },
    orderBy: { data: "asc" },
  });

  return NextResponse.json(execucoes);
}

// ── POST: marcar ritual como realizado / não realizado ───────────────────────

export async function POST(req: NextRequest) {
  try {
    const { ritualId, data, realizado, notas } = await req.json();

    if (!ritualId || !data) {
      return NextResponse.json(
        { error: "Campos obrigatorios: ritualId, data" },
        { status: 400 },
      );
    }

    const dataDate = new Date(data);
    // Normalizar para meia-noite UTC
    dataDate.setUTCHours(0, 0, 0, 0);

    const execucao = await prisma.ritualExecucao.upsert({
      where: {
        ritualId_data: { ritualId, data: dataDate },
      },
      update: {
        realizado: realizado ?? true,
        notas: notas ?? undefined,
      },
      create: {
        ritualId,
        data: dataDate,
        realizado: realizado ?? true,
        notas: notas ?? undefined,
      },
    });

    return NextResponse.json(execucao);
  } catch (err) {
    console.error("[rituais POST]", err);
    return NextResponse.json(
      { error: "Erro interno ao registrar ritual" },
      { status: 500 },
    );
  }
}
