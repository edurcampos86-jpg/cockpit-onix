import "server-only";

/**
 * In-process pub/sub para broadcast de eventos SSE.
 *
 * Funciona porque o Cockpit roda em UMA replica no Railway (verificado
 * em railway.toml — não tem `replicas: N`). Se um dia escalarmos pra
 * múltiplas replicas, migrar pra Redis pub/sub (a interface dessa
 * função fica igual, só muda a impl).
 *
 * Eventos suportados:
 *   - conversa-update: nova conversa ou mensagem chegou pro cliente X.
 *   - presence:        (futuro) status do assessor online/offline.
 *
 * Cada subscriber está atrelado a um clienteId; brodcast pra um
 * clienteId só notifica quem está ouvindo aquele cliente.
 */

export type SseEvent =
  | { type: "conversa-update"; conversaId: string; lastMessageAt: string }
  | { type: "hello"; clienteId: string }
  | { type: "ping" };

type Subscriber = (data: SseEvent) => void;

// Map: clienteId → set de callbacks
const subs = new Map<string, Set<Subscriber>>();

export function subscribe(clienteId: string, cb: Subscriber): () => void {
  if (!subs.has(clienteId)) subs.set(clienteId, new Set());
  subs.get(clienteId)!.add(cb);
  return () => {
    const set = subs.get(clienteId);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) subs.delete(clienteId);
  };
}

export function broadcastConversaUpdate(
  clienteId: string,
  payload: { conversaId: string; lastMessageAt: Date | string },
) {
  const event: SseEvent = {
    type: "conversa-update",
    conversaId: payload.conversaId,
    lastMessageAt:
      payload.lastMessageAt instanceof Date
        ? payload.lastMessageAt.toISOString()
        : payload.lastMessageAt,
  };
  const set = subs.get(clienteId);
  if (!set) return;
  for (const cb of set) {
    try {
      cb(event);
    } catch (e) {
      console.error("[sse-bus] subscriber callback error:", e);
    }
  }
}

/** Telemetria leve — útil pra debug em /api/admin/sse-status (opcional). */
export function getSubscriberCount(): { totalClientes: number; totalSubscribers: number } {
  let totalSubscribers = 0;
  for (const set of subs.values()) totalSubscribers += set.size;
  return { totalClientes: subs.size, totalSubscribers };
}
