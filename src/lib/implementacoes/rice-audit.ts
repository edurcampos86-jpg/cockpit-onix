import "server-only";
import { prisma } from "../prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Audit log append-only do fluxo "Sugerir RICE com IA" (SugestaoRiceLog).
 * UMA linha por evento (sugerida | confirmada | descartada) — só INSERT, NUNCA
 * UPDATE (Design A). Fire-and-forget no molde de src/lib/juridico/audit.ts:
 * try/catch pra que falha de persistência NUNCA quebre a resposta principal.
 */

export type RiceValores = {
  reach?: number | null;
  impact?: number | null;
  confidence?: number | null;
  effort?: number | null;
  score?: number | null;
  confiancaGeral?: string | null;
};

/**
 * Loga o evento "sugerida" (a IA devolveu uma sugestão). Retorna o id da linha
 * pro front correlacionar a confirmação/descarte via sugestaoLogId — ou null se
 * a persistência falhar (não derruba a sugestão).
 */
export async function logSugestaoRiceSugerida(params: {
  implementacaoId: string;
  usuarioId: string;
  usuarioNome: string;
  valores: RiceValores;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const row = await prisma.sugestaoRiceLog.create({
      data: {
        evento: "sugerida",
        implementacaoId: params.implementacaoId,
        usuarioId: params.usuarioId,
        usuarioNome: params.usuarioNome,
        reach: params.valores.reach ?? null,
        impact: params.valores.impact ?? null,
        confidence: params.valores.confidence ?? null,
        effort: params.valores.effort ?? null,
        score: params.valores.score ?? null,
        confiancaGeral: params.valores.confiancaGeral ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[implementacoes/rice-audit] falha ao logar 'sugerida':", e);
    return null;
  }
}

/**
 * Loga o resultado ("confirmada" | "descartada") correlacionado à sugestão
 * original via sugestaoLogId. Fire-and-forget (void) — nunca lança.
 */
export async function logResultadoSugestaoRice(params: {
  evento: "confirmada" | "descartada";
  implementacaoId: string;
  sugestaoLogId: string | null;
  usuarioId: string;
  usuarioNome: string;
  valores: RiceValores;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.sugestaoRiceLog.create({
      data: {
        evento: params.evento,
        implementacaoId: params.implementacaoId,
        sugestaoLogId: params.sugestaoLogId,
        usuarioId: params.usuarioId,
        usuarioNome: params.usuarioNome,
        reach: params.valores.reach ?? null,
        impact: params.valores.impact ?? null,
        confidence: params.valores.confidence ?? null,
        effort: params.valores.effort ?? null,
        score: params.valores.score ?? null,
        confiancaGeral: params.valores.confiancaGeral ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });
  } catch (e) {
    console.error(
      `[implementacoes/rice-audit] falha ao logar '${params.evento}':`,
      e,
    );
  }
}
