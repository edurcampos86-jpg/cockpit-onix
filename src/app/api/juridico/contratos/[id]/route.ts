/**
 * GET /api/juridico/contratos/[id]
 *
 * Detalhe completo + todas as extrações (histórico).
 * Auth: admin.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctxParams: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx || !isAdmin(ctx)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await ctxParams.params;

  const contrato = await prisma.contratoArquivo.findUnique({
    where: { id },
    include: {
      pessoa: {
        select: { id: true, nomeCompleto: true, apelido: true, cpf: true, email: true },
      },
      uploadedBy: { select: { id: true, name: true, email: true } },
      acordoComercial: { select: { id: true, tipo: true, dataInicio: true, dataFim: true } },
      extracoes: {
        orderBy: { extraidoEm: "desc" },
        include: {
          revisadoPor: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!contrato) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    id: contrato.id,
    nomeOriginal: contrato.nomeOriginal,
    tamanhoBytes: Number(contrato.tamanhoBytes),
    mimeType: contrato.mimeType,
    hashSha256: contrato.hashSha256,
    b2Bucket: contrato.b2Bucket,
    b2Key: contrato.b2Key,
    status: contrato.status,
    origemImportacao: contrato.origemImportacao,
    observacoes: contrato.observacoes,
    uploadedAt: contrato.uploadedAt.toISOString(),
    uploadedBy: contrato.uploadedBy,
    pessoa: contrato.pessoa,
    acordoComercial: contrato.acordoComercial,
    extracoes: contrato.extracoes.map((e) => ({
      id: e.id,
      modeloIa: e.modeloIa,
      promptVersion: e.promptVersion,
      confianca: e.confianca,
      dadosExtraidos: e.dadosExtraidos,
      dadosCorrigidos: e.dadosCorrigidos,
      erroExtracao: e.erroExtracao,
      extraidoEm: e.extraidoEm.toISOString(),
      statusRevisao: e.statusRevisao,
      revisadoEm: e.revisadoEm?.toISOString() ?? null,
      revisadoPor: e.revisadoPor,
      observacoesRevisao: e.observacoesRevisao,
    })),
  });
}
