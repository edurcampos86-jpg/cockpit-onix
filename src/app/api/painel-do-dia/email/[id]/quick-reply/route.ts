import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
  EmailNotFoundError,
  ScopeMissingError,
  gerarESalvarDraft,
} from "@/lib/painel-do-dia/quick-reply";
import {
  GoogleNotConnectedError,
  isInvalidGrantError,
} from "@/lib/integrations/google-user-oauth";

export const dynamic = "force-dynamic";

/**
 * POST /api/painel-do-dia/email/[id]/quick-reply
 *
 * Gera uma resposta com o Claude para um PainelEmailAI classificado e salva
 * como rascunho no Gmail do usuário. Nada é enviado — só salvo em Drafts.
 *
 * Códigos:
 *  - 200 → { draftId, draftUrl, preview }
 *  - 400 → email não encontrado pra este usuário
 *  - 401 → sem sessão
 *  - 412 → conta Google sem escopo gmail.compose (precisa reconectar)
 *          → { error: "scope_missing", needReconnect: true }
 *  - 429 → rate limit
 *  - 502 → erro do Gmail/Claude
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Limite mais apertado que o painel.emails padrão — Claude + Gmail draft
  // custam mais que um GET, e não queremos abusar da quota Anthropic.
  const limit = checkRateLimit(session.userId, "painel.emails.quick-reply", 30);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Limite de requisições excedido. Tente em alguns minutos." },
      { status: 429, headers: rateLimitHeaders(limit) },
    );
  }

  const { id } = await params;

  try {
    const { draftId, draftUrl, preview } = await gerarESalvarDraft(
      session.userId,
      id,
    );
    return NextResponse.json(
      { draftId, draftUrl, preview },
      { headers: rateLimitHeaders(limit) },
    );
  } catch (err) {
    if (err instanceof EmailNotFoundError) {
      return NextResponse.json(
        { error: "Email não encontrado." },
        { status: 400, headers: rateLimitHeaders(limit) },
      );
    }
    if (err instanceof ScopeMissingError) {
      return NextResponse.json(
        { error: "scope_missing", needReconnect: true },
        { status: 412, headers: rateLimitHeaders(limit) },
      );
    }
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: "google_not_connected", needReconnect: true },
        { status: 412, headers: rateLimitHeaders(limit) },
      );
    }
    if (isInvalidGrantError(err)) {
      return NextResponse.json(
        { error: "invalid_grant", needReconnect: true },
        { status: 412, headers: rateLimitHeaders(limit) },
      );
    }
    const msg = err instanceof Error ? err.message : "Erro ao gerar rascunho";
    console.error("[/api/painel-do-dia/email/[id]/quick-reply]", err);
    return NextResponse.json(
      { error: msg },
      { status: 502, headers: rateLimitHeaders(limit) },
    );
  }
}
