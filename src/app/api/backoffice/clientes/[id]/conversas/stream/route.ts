import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { subscribe, type SseEvent } from "@/lib/sse-bus";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";

/**
 * GET /api/backoffice/clientes/[id]/conversas/stream
 *
 * Server-Sent Events: push de eventos de tempo real para o dossiê do cliente.
 * Eventos:
 *   - hello             (handshake inicial)
 *   - conversa-update   (nova conversa/mensagem chegou)
 *   - ping              (heartbeat a cada 25s para keep-alive)
 *
 * Cliente conecta via:
 *   const es = new EventSource('/api/backoffice/clientes/abc/conversas/stream');
 *   es.onmessage = (ev) => { const data = JSON.parse(ev.data); ... };
 *
 * IMPORTANTE: requer sessão autenticada (cookie 'session').
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Edge não suporta keep-alive longo

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("unauthorized", { status: 401 });
  }
  const { id } = await params;

  // RBAC — Camada 2 (escopo). Flag RBAC_ENFORCEMENT (default OFF) → idêntico a
  // hoje. ON → cliente fora do escopo responde 404 ANTES de abrir o SSE — não
  // entrega updates de conversa em tempo real de cliente fora do escopo.
  if (await rbacEnforcementHabilitado()) {
    const ctx = await getAuthContext();
    const { visivel } = await assertClienteVisivel(id, ctx);
    if (!visivel) {
      return new Response("not found", { status: 404 });
    }
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: SseEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream provavelmente já fechado
          closed = true;
          unsub();
          clearInterval(heartbeat);
        }
      };

      // Handshake
      send({ type: "hello", clienteId: id });

      // Inscreve no bus
      const unsub = subscribe(id, send);

      // Heartbeat a cada 25s (cloudflare/proxies costumam fechar conexões
      // ociosas em 30s)
      const heartbeat = setInterval(() => send({ type: "ping" }), 25_000);

      // Cleanup quando cliente desconecta
      req.signal.addEventListener("abort", () => {
        closed = true;
        unsub();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // já fechado
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // desativa buffering no nginx (se houver proxy)
    },
  });
}
