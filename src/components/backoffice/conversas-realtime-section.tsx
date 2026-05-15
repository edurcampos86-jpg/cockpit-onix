"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Wifi, WifiOff, User, Headphones } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ConversasRealtimeSection
 *
 * Seção do dossiê do cliente que mostra as conversas WhatsApp do
 * DataCrazy vinculadas a esse cliente, atualizando em tempo real
 * via SSE.
 *
 * Como plugar:
 *   1. Importar:
 *        import { ConversasRealtimeSection } from
 *          "@/components/backoffice/conversas-realtime-section";
 *
 *   2. Renderizar dentro de ClienteDetalhe (ou em cliente-detalhe.tsx
 *      perto da seção "Histórico de contatos"):
 *
 *        <ConversasRealtimeSection clienteId={cliente.id} />
 *
 * Comportamento:
 *   - GET inicial em /api/backoffice/clientes/{id}/conversas
 *   - SSE em /api/backoffice/clientes/{id}/conversas/stream
 *   - Quando recebe evento `conversa-update`, refaz o GET (re-render
 *     mínimo, sem flicker porque React reconcilia por key)
 *   - Reconexão automática (EventSource nativo já faz isso)
 */

interface Mensagem {
  id: string;
  fromMe: boolean;
  tipo: string;
  body: string | null;
  mediaUrl: string | null;
  sentAt: string;
}

interface Conversa {
  id: string;
  externalId: string;
  contactPhone: string | null;
  contactName: string | null;
  lastMessageAt: string | null;
  totalMensagens: number;
  mensagens: Mensagem[];
}

export function ConversasRealtimeSection({ clienteId }: { clienteId: string }) {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [conectado, setConectado] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  async function recarregar() {
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/conversas`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = await res.json();
      setConversas(data.conversas ?? []);
    } catch (e) {
      console.error("[conversas-realtime] erro ao carregar:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    recarregar();

    // Abre SSE
    const es = new EventSource(
      `/api/backoffice/clientes/${clienteId}/conversas/stream`,
    );
    esRef.current = es;

    es.onopen = () => setConectado(true);
    es.onerror = () => setConectado(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "hello") setConectado(true);
        if (data.type === "conversa-update") recarregar();
        // ping é ignorado — só serve pra manter conexão viva
      } catch (e) {
        console.error("[conversas-realtime] erro parse SSE:", e);
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Conversas WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Conversas WhatsApp
            <Badge variant="secondary">{conversas.length}</Badge>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {conectado ? (
              <>
                <Wifi className="h-3 w-3 text-green-500" /> ao vivo
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 text-amber-500" /> reconectando…
              </>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {conversas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conversa do DataCrazy vinculada a esse cliente ainda.
            Quando uma mensagem chegar, ela aparece aqui automaticamente.
          </p>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {conversas.map((c) => (
                <ConversaBlock key={c.id} conversa={c} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function ConversaBlock({ conversa }: { conversa: Conversa }) {
  return (
    <div className="border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-medium">
            {conversa.contactName ?? conversa.contactPhone ?? "Contato sem nome"}
          </p>
          {conversa.contactPhone && conversa.contactName && (
            <p className="text-xs text-muted-foreground">{conversa.contactPhone}</p>
          )}
        </div>
        {conversa.lastMessageAt && (
          <span className="text-xs text-muted-foreground">
            {new Date(conversa.lastMessageAt).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {conversa.mensagens.slice(-10).map((m) => (
          <MensagemBubble key={m.id} mensagem={m} />
        ))}
        {conversa.totalMensagens > conversa.mensagens.length && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            {conversa.totalMensagens - conversa.mensagens.length} mensagens mais antigas
          </p>
        )}
      </div>
    </div>
  );
}

function MensagemBubble({ mensagem }: { mensagem: Mensagem }) {
  const Icon = mensagem.fromMe ? Headphones : User;
  const align = mensagem.fromMe ? "justify-end" : "justify-start";
  const bubbleBg = mensagem.fromMe ? "bg-primary/10" : "bg-muted";

  return (
    <div className={`flex ${align}`}>
      <div
        className={`flex gap-2 max-w-[80%] p-2 rounded-lg ${bubbleBg}`}
      >
        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="text-sm">
          {mensagem.tipo === "text" && mensagem.body ? (
            <span>{mensagem.body}</span>
          ) : mensagem.tipo === "audio" ? (
            <em className="text-muted-foreground">[áudio]</em>
          ) : mensagem.tipo === "image" ? (
            <em className="text-muted-foreground">[imagem]</em>
          ) : mensagem.tipo === "video" ? (
            <em className="text-muted-foreground">[vídeo]</em>
          ) : mensagem.tipo === "document" ? (
            <em className="text-muted-foreground">[documento]</em>
          ) : (
            <em className="text-muted-foreground">[{mensagem.tipo}]</em>
          )}
          <div className="text-[10px] text-muted-foreground mt-1">
            {new Date(mensagem.sentAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
