import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Tipos de alerta e limiares ───────────────────────────────────────────────

const THRESHOLD_PARADO_H = 48;
const THRESHOLD_ALTO_TICKET = 500_000;
const THRESHOLD_REATIVACAO_DIAS = 60;

type Prioridade = "alta" | "media" | "baixa";

function classificarPrioridade(valor: number, horasParado: number): Prioridade {
  if (valor >= THRESHOLD_ALTO_TICKET) return "alta";
  if (horasParado > 96 || valor >= 200_000) return "media";
  return "baixa";
}

// ── GET: lista alertas computados ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo"); // "parados" | "adormecidos" | "todos"
  const prioridadeFiltro = searchParams.get("prioridade"); // "alta" | "media" | "baixa"

  const agora = new Date();
  const threshold48h = new Date(agora.getTime() - THRESHOLD_PARADO_H * 60 * 60 * 1000);

  const alertas: unknown[] = [];

  // 1. Negócios parados (ativos, sem atividade >48h)
  if (!tipo || tipo === "parados" || tipo === "todos") {
    const parados = await prisma.negocioPipeline.findMany({
      where: {
        ativo: true,
        etapa: { not: "Adormecido" },
        ultimaAtividade: { lt: threshold48h },
      },
      include: {
        resolucoes: { orderBy: { resolvidoEm: "desc" }, take: 1 },
      },
      orderBy: { ultimaAtividade: "asc" },
    });

    for (const n of parados) {
      const horasParado = (agora.getTime() - n.ultimaAtividade.getTime()) / (1000 * 60 * 60);
      const diasParado = Math.floor(horasParado / 24);
      const prioridade = classificarPrioridade(n.valor, horasParado);

      if (prioridadeFiltro && prioridade !== prioridadeFiltro) continue;

      alertas.push({
        id: n.id,
        tipo: n.valor >= THRESHOLD_ALTO_TICKET ? "alto_ticket" : "parado_48h",
        prioridade,
        nomeCliente: n.nomeCliente,
        valor: n.valor,
        responsavel: n.responsavel,
        etapa: n.etapa,
        ultimaAtividade: n.ultimaAtividade,
        diasParado,
        horasParado: Math.floor(horasParado),
        ultimaResolucao: n.resolucoes[0] ?? null,
      });
    }
  }

  // 2. Negócios adormecidos com recontato pendente
  if (!tipo || tipo === "adormecidos" || tipo === "todos") {
    const adormecidos = await prisma.negocioPipeline.findMany({
      where: {
        OR: [
          { etapa: "Adormecido" },
          { motivoPerda: { not: null } },
        ],
      },
      include: {
        resolucoes: { orderBy: { resolvidoEm: "desc" }, take: 1 },
      },
      orderBy: { dataRecontato: "asc" },
    });

    for (const n of adormecidos) {
      if (prioridadeFiltro && prioridadeFiltro !== "media") continue;

      const recontatoVencido = n.dataRecontato && n.dataRecontato <= agora;
      const diasAteRecontato = n.dataRecontato
        ? Math.ceil((n.dataRecontato.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      alertas.push({
        id: n.id,
        tipo: "reativacao_60d",
        prioridade: recontatoVencido ? "alta" : "media",
        nomeCliente: n.nomeCliente,
        valor: n.valor,
        responsavel: n.responsavel,
        etapa: n.etapa,
        motivoPerda: n.motivoPerda,
        dataPerda: n.dataPerda,
        dataRecontato: n.dataRecontato,
        diasAteRecontato,
        recontatoVencido: !!recontatoVencido,
        ultimaResolucao: n.resolucoes[0] ?? null,
      });
    }
  }

  // Ordenar por prioridade
  const ordemPrioridade: Record<string, number> = { alta: 0, media: 1, baixa: 2 };
  alertas.sort(
    (a: any, b: any) =>
      (ordemPrioridade[a.prioridade] ?? 3) - (ordemPrioridade[b.prioridade] ?? 3),
  );

  return NextResponse.json({
    total: alertas.length,
    alertas,
    geradoEm: agora.toISOString(),
  });
}

// ── POST: resolver alerta (registrar ação tomada) ────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { negocioId, tipo, acaoTomada } = await req.json();

    if (!negocioId || !tipo || !acaoTomada) {
      return NextResponse.json(
        { error: "Campos obrigatorios: negocioId, tipo, acaoTomada" },
        { status: 400 },
      );
    }

    const resolucao = await prisma.alertaResolucao.create({
      data: {
        negocioId,
        tipo,
        acaoTomada,
      },
    });

    // Se é uma resolução de parado, atualizar ultimaAtividade para "agora"
    if (tipo === "parado_48h" || tipo === "alto_ticket") {
      await prisma.negocioPipeline.update({
        where: { id: negocioId },
        data: { ultimaAtividade: new Date() },
      });
    }

    return NextResponse.json(resolucao);
  } catch (err) {
    console.error("[alertas POST]", err);
    return NextResponse.json(
      { error: "Erro interno ao resolver alerta" },
      { status: 500 },
    );
  }
}

// ── PATCH: marcar negócio como adormecido ────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const { id, motivoPerda } = await req.json();

    if (!id || !motivoPerda) {
      return NextResponse.json(
        { error: "Campos obrigatorios: id, motivoPerda" },
        { status: 400 },
      );
    }

    const motivos = ["preco", "timing", "concorrencia", "atendimento", "outro"];
    if (!motivos.includes(motivoPerda)) {
      return NextResponse.json(
        { error: `motivoPerda deve ser um de: ${motivos.join(", ")}` },
        { status: 400 },
      );
    }

    const agora = new Date();
    const dataRecontato = new Date(agora.getTime() + THRESHOLD_REATIVACAO_DIAS * 24 * 60 * 60 * 1000);

    const deal = await prisma.negocioPipeline.update({
      where: { id },
      data: {
        etapa: "Adormecido",
        motivoPerda,
        dataPerda: agora,
        dataRecontato,
      },
    });

    return NextResponse.json(deal);
  } catch (err) {
    console.error("[alertas PATCH]", err);
    return NextResponse.json(
      { error: "Erro interno ao marcar como adormecido" },
      { status: 500 },
    );
  }
}
