import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fetchEmailsAcao } from "@/lib/painel-do-dia/google-fetch";
import { processarTriagemEmails } from "@/lib/painel-do-dia/triar-emails";
import { GoogleNotConnectedError } from "@/lib/integrations/google-user-oauth";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import type { EmailClassificado, QuadrantePM } from "@/lib/painel-do-dia/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/painel-do-dia/emails
 * E-mails não lidos das últimas 24h que parecem "pedir ação".
 * Heurística: assunto com '?'  OU  destinatário direto = você  OU  contém
 * palavra-chave (preciso, urgente, favor, quando, aguardo, ...).
 *
 * Depois do fetch: roda triagem AI (Claude) nos novos, enriquece o response
 * com aiId/tipo/urgencia/quadranteSugerido/tituloAcao para a UI conseguir
 * mostrar badges e botoes "Criar acao"/"Arquivar".
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const limit = checkRateLimit(session.userId, "painel.emails");
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de requisições excedido. Tente em alguns minutos." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  try {
    const emails = await fetchEmailsAcao(session.userId, 10);

    if (emails.length > 0) {
      try {
        await processarTriagemEmails(session.userId, emails);
      } catch (err) {
        console.error("[/api/painel-do-dia/emails] triagem falhou", err);
      }
    }

    const aiRows = await prisma.painelEmailAI.findMany({
      where: {
        userId: session.userId,
        externoId: { in: emails.map((e) => e.id) },
      },
    });

    const aiPorExterno = new Map(
      aiRows.filter((r) => !r.arquivado).map((r) => [r.externoId, r]),
    );
    const arquivados = new Set(
      aiRows.filter((r) => r.arquivado).map((r) => r.externoId),
    );

    const enriquecidos: EmailClassificado[] = emails
      .filter((e) => !arquivados.has(e.id))
      .map((e) => {
        const ai = aiPorExterno.get(e.id);
        if (!ai) return e;
        return {
          ...e,
          aiId: ai.id,
          tipo: ai.tipo as EmailClassificado["tipo"],
          urgencia: ai.urgencia as EmailClassificado["urgencia"],
          quadranteSugerido: (ai.quadranteSugerido ?? undefined) as
            | QuadrantePM
            | undefined,
          tituloAcao: ai.tituloAcao ?? undefined,
          venceSugerido: ai.venceSugerido?.toISOString(),
          clienteVinculadoId: ai.clienteVinculadoId ?? undefined,
          processado: ai.processado,
        };
      });

    return NextResponse.json(
      {
        connected: true,
        source: "gmail",
        fetchedAt: new Date().toISOString(),
        emails: enriquecidos,
      },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { connected: false, source: "gmail", emails: [] },
        { status: 200, headers: rateLimitHeaders(limit) },
      );
    }
    const msg = err instanceof Error ? err.message : "Erro ao buscar e-mails";
    return NextResponse.json(
      { connected: true, source: "gmail", error: msg, emails: [] },
      { status: 502, headers: rateLimitHeaders(limit) },
    );
  }
}
