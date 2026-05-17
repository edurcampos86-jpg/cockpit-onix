import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config-db";
import {
  ingestConversa,
  normalizarTipoMensagem,
  extrairBody,
  type ConversaCanonical,
  type MensagemCanonical,
} from "@/lib/datacrazy-ingest";

/**
 * POST /api/webhooks/datacrazy
 *
 * Endpoint público que recebe pushes do DataCrazy quando uma mensagem nova
 * chega no WhatsApp. Configure a URL no painel do DataCrazy (procurar por
 * "webhooks" ou "integrações" na conta) apontando pra:
 *
 *   https://cockpit-onix-production.up.railway.app/api/webhooks/datacrazy
 *
 * Autenticação: header `x-webhook-secret` ou `authorization: Bearer ...`
 *   contendo o valor de DATACRAZY_WEBHOOK_SECRET (salvo na tabela Config).
 *
 * Estrutura esperada do payload (best-effort — adaptamos no parsing):
 *   {
 *     event: "message.created" | "message.updated" | ...,
 *     conversationId: "abc",
 *     instanceId: "...",
 *     contact: { phone: "5571999999999", name: "Fulano" },
 *     message: {
 *       id: "msg-xyz",
 *       type: "text",
 *       body: "olá",
 *       fromMe: false,
 *       createdAt: "2026-05-13T18:00:00Z",
 *       mediaUrl: null
 *     }
 *   }
 *
 * O handler é TOLERANTE a variações de schema — se a estrutura mudar,
 * salvamos o `rawPayload` na tabela Mensagem pra inspecionar depois.
 *
 * Sempre responde 200 quando consegue parsear (mesmo que falhe o match)
 * pra evitar retry storm do DataCrazy. Erro real só com 4xx em payload
 * inválido ou 401 em secret errado.
 */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────
  const secret = await getConfig("DATACRAZY_WEBHOOK_SECRET");
  if (secret) {
    const authHeader = req.headers.get("authorization") || "";
    const candidates = [
      authHeader.replace(/^Bearer\s+/i, ""),
      authHeader, // raw
      req.headers.get("x-webhook-secret") || "",
      req.headers.get("x-datacrazy-signature") || "",
      req.headers.get("x-api-key") || "",
    ];
    if (!candidates.some((c) => c === secret)) {
      console.warn(
        "[datacrazy-webhook] secret inválido — headers:",
        Object.fromEntries(req.headers.entries()),
      );
      return NextResponse.json({ ok: false, message: "Secret inválido" }, { status: 401 });
    }
  } else {
    console.warn(
      "[datacrazy-webhook] DATACRAZY_WEBHOOK_SECRET não setado — aceitando qualquer requisição (DEV ONLY)",
    );
  }

  // ── Parse ──────────────────────────────────────────────────────────
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, message: "Body inválido" }, { status: 400 });
  }

  const event = String(raw.event ?? "");

  // ── Extrai conversa + mensagem do payload ──────────────────────────
  const conversationId =
    (raw.conversationId as string | undefined) ??
    (raw.conversation_id as string | undefined) ??
    ((raw.conversation as Record<string, unknown> | undefined)?.id as string | undefined);

  if (!conversationId) {
    console.warn("[datacrazy-webhook] sem conversationId no payload:", raw);
    return NextResponse.json(
      { ok: false, message: "conversationId ausente" },
      { status: 400 },
    );
  }

  const contact = (raw.contact as Record<string, unknown> | undefined) ?? {};
  const messageObj = (raw.message as Record<string, unknown> | undefined) ?? {};

  // Datacrazy expõe o telefone como `contact.contactId` (sem "+", às vezes
  // sem o "9" inicial de celulares BR). Pular IDs especiais (@lid).
  const rawContactId = contact.contactId as string | undefined;
  const contactIdValido = rawContactId && !rawContactId.includes("@") ? rawContactId : undefined;

  const conv: ConversaCanonical = {
    externalId: conversationId,
    instanceId:
      (raw.instanceId as string | undefined) ??
      (raw.instance_id as string | undefined) ??
      ((raw.instance as Record<string, unknown> | undefined)?.id as string | undefined) ??
      "",
    contactPhone:
      (contact.phone as string | undefined) ??
      (contact.number as string | undefined) ??
      contactIdValido ??
      (raw.phone as string | undefined) ??
      null,
    contactName:
      (contact.name as string | undefined) ??
      (raw.contactName as string | undefined) ??
      null,
    lastMessageAt:
      (messageObj.createdAt as string | undefined) ??
      (raw.timestamp as string | undefined) ??
      new Date().toISOString(),
  };

  // Descartar conversas de grupo — não fazem sentido pra rastrear cadência
  // de cliente individual.
  if ((raw.isGroup === true) || ((raw.conversation as Record<string, unknown> | undefined)?.isGroup === true)) {
    return NextResponse.json({ ok: true, ignored: "group" }, { status: 200 });
  }

  // Determina se há mensagem nova (em events tipo conversation.updated
  // pode vir só metadata). Se houver, ingeremos. Se não, só atualizamos
  // a conversa.
  const mensagens: MensagemCanonical[] = [];
  const messageId =
    (messageObj.id as string | undefined) ?? (messageObj._id as string | undefined);

  if (messageId && (event === "" || event.startsWith("message"))) {
    mensagens.push({
      externalId: messageId,
      conversaExternalId: conversationId,
      fromMe:
        messageObj.fromMe === true ||
        (messageObj.received === false && messageObj.fromMe !== false),
      tipo: normalizarTipoMensagem(
        (messageObj.type as string | undefined) ??
          (messageObj.messageType as string | undefined),
      ),
      body: extrairBody(messageObj),
      mediaUrl:
        (messageObj.mediaUrl as string | undefined) ??
        (messageObj.media_url as string | undefined) ??
        null,
      sentAt:
        (messageObj.createdAt as string | undefined) ??
        (messageObj.timestamp as string | undefined) ??
        new Date().toISOString(),
      rawPayload: raw,
    });
  }

  // ── Ingest ─────────────────────────────────────────────────────────
  try {
    const result = await ingestConversa(conv, mensagens);
    return NextResponse.json({
      ok: true,
      conversaId: result.conversaId,
      clienteId: result.clienteId,
      novasMensagens: result.novasMensagens,
    });
  } catch (e) {
    console.error("[datacrazy-webhook] erro no ingest:", e);
    // Não 5xx aqui pra evitar retry storm — logamos e seguimos
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "erro" },
      { status: 200 },
    );
  }
}

/** GET pra health-check / verificação de URL pelo painel DataCrazy. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "datacrazy-webhook",
    timestamp: new Date().toISOString(),
  });
}
