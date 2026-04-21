import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { EncerrarAcaoInput } from "@/lib/painel-do-dia/types";

/**
 * POST /api/painel-do-dia/acoes/[id]/encerrar
 *
 * Fecho estruturado de uma acao: marca como concluida, guarda resultado,
 * tempo gasto, cliente vinculado e cria InteracaoCliente no CRM quando
 * `registrarCrm` true + cliente informado. Opcionalmente cria follow-up
 * como nova AcaoPainel (origem=cockpit) se `proximoPasso` informado.
 *
 * Atende Sugestao 4 do roadmap do Painel do Dia.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as EncerrarAcaoInput;

  const existente = await prisma.acaoPainel.findFirst({
    where: { id, userId: session.userId },
  });
  if (!existente) {
    return NextResponse.json({ error: "nao encontrada" }, { status: 404 });
  }

  const agora = new Date();
  const precisaSync = existente.origem !== "cockpit";
  const registrarCrm =
    !!body.registrarCrm && !!body.clienteVinculadoId && !existente.registradaCrm;

  const acaoAtualizada = await prisma.$transaction(async (tx) => {
    // 1. Fecha a acao
    const atualizada = await tx.acaoPainel.update({
      where: { id },
      data: {
        concluida: true,
        concluidaEm: agora,
        resultado: body.resultado ?? null,
        tempoGastoMin: body.tempoGastoMin ?? null,
        clienteVinculadoId: body.clienteVinculadoId ?? null,
        registradaCrm: registrarCrm || existente.registradaCrm,
        pendingSync: precisaSync ? true : undefined,
        syncOp: precisaSync ? "update" : undefined,
        syncError: precisaSync ? null : undefined,
      },
    });

    // 2. Cria InteracaoCliente no CRM se solicitado
    if (registrarCrm && body.clienteVinculadoId) {
      await tx.interacaoCliente.create({
        data: {
          clienteId: body.clienteVinculadoId,
          tipo: inferirTipoInteracao(existente.titulo),
          assunto: existente.titulo,
          resumo: body.resultado ?? null,
          data: agora,
          duracaoMin: body.tempoGastoMin ?? null,
        },
      });
      // Atualiza ultimoContatoAt do cliente
      await tx.clienteBackoffice.update({
        where: { id: body.clienteVinculadoId },
        data: { ultimoContatoAt: agora },
      });
    }

    // 3. Cria follow-up (proximo passo) como acao cockpit local
    if (body.proximoPasso && body.proximoPasso.trim().length > 0) {
      await tx.acaoPainel.create({
        data: {
          userId: session.userId,
          titulo: body.proximoPasso.trim(),
          origem: "cockpit",
          noMeuDia: false,
          importante: true,
          quadrante: "Q2",
        },
      });
    }

    return atualizada;
  });

  return NextResponse.json({
    ok: true,
    acao: acaoAtualizada,
    crmRegistrado: registrarCrm,
    followUpCriado: !!body.proximoPasso?.trim(),
  });
}

/**
 * Heuristica simples para tipo de interacao baseado no titulo.
 * Futuramente: ajustar com Plaud AI (transcricao da reuniao).
 */
function inferirTipoInteracao(titulo: string): string {
  const t = titulo.toLowerCase();
  if (/(ligar|lig[aá]|ligacao|call|telefone)/.test(t)) return "ligacao";
  if (/(reuni[aã]o|meeting|videoconfer|presencial)/.test(t)) return "reuniao";
  if (/(email|e-mail)/.test(t)) return "email";
  if (/(whatsapp|wpp|zap)/.test(t)) return "whatsapp";
  if (/(revis[aã]o|review)/.test(t)) return "revisao";
  return "reuniao";
}
