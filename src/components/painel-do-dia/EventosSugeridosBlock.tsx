"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Calendar, CheckCircle2, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventoSugerido } from "@/lib/painel-do-dia/types";

/**
 * Card no Painel do Dia listando sugestões de evento extraídas dos e-mails
 * pela triagem (PainelEmailAI.eventoSugeridoJson).
 *
 * O agregador server-side filtra os e-mails do usuário onde:
 *   eventoSugeridoJson IS NOT NULL AND eventoProcessado = false
 * e passa só esses cards.
 *
 * Aqui é só UI: dois botões por card chamando os endpoints já criados.
 */
export type SugestaoEventoCard = {
  emailAiId: string;
  remetente: string;
  assunto: string;
  evento: EventoSugerido;
};

function formatarIntervalo(inicioISO: string, fimISO: string): string {
  try {
    const ini = new Date(inicioISO);
    const fim = new Date(fimISO);
    const fmtDia = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Bahia",
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    const fmtHora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Bahia",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${fmtDia.format(ini)} · ${fmtHora.format(ini)} – ${fmtHora.format(fim)}`;
  } catch {
    return `${inicioISO} – ${fimISO}`;
  }
}

export function EventosSugeridosBlock({
  sugestoes,
}: {
  sugestoes: SugestaoEventoCard[];
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (sugestoes.length === 0) return null;

  async function marcar(emailAiId: string) {
    setErro(null);
    setLoadingId(emailAiId);
    try {
      const res = await fetch(
        `/api/painel-do-dia/email/${emailAiId}/criar-evento`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErro(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao criar evento");
    } finally {
      setLoadingId(null);
    }
  }

  async function ignorar(emailAiId: string) {
    setErro(null);
    setLoadingId(emailAiId);
    try {
      const res = await fetch(
        `/api/painel-do-dia/email/${emailAiId}/ignorar-evento`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErro(data.error ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao ignorar evento");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Eventos sugeridos por e-mail
          <Badge variant="outline" className="h-5 text-[10px]">
            {sugestoes.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {erro && (
          <p className="mb-3 text-sm text-destructive">{erro}</p>
        )}
        <ul className="flex flex-col gap-2">
          {sugestoes.map((s) => {
            const intervalo = formatarIntervalo(
              s.evento.inicioISO,
              s.evento.fimISO
            );
            const busy = loadingId === s.emailAiId;
            return (
              <li
                key={s.emailAiId}
                className="rounded-md ring-1 ring-foreground/10 p-3"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium truncate">
                    {s.evento.titulo}
                  </p>
                  <Badge variant="outline" className="h-5 text-[10px]">
                    {intervalo}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  De {s.remetente} · &ldquo;{s.assunto}&rdquo;
                </p>
                {s.evento.local && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {s.evento.local}
                  </p>
                )}
                {s.evento.participantes.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Participantes: {s.evento.participantes.join(", ")}
                  </p>
                )}
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => ignorar(s.emailAiId)}
                  >
                    <X className="h-3 w-3" /> Ignorar
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => marcar(s.emailAiId)}
                  >
                    <CheckCircle2 className="h-3 w-3" /> Marcar
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
