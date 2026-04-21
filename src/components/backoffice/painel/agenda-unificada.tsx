"use client";

import { useState } from "react";
import { AlertTriangle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EventoAgenda } from "@/lib/painel-do-dia/types";

const HORA_INICIO = 8;
const HORA_FIM = 20;
const SLOTS: number[] = Array.from(
  { length: HORA_FIM - HORA_INICIO },
  (_, i) => HORA_INICIO + i
);

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bahia",
});

const fmtHoraNum = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  hour12: false,
  timeZone: "America/Bahia",
});

function horaInicio(iso: string): number {
  return Number(fmtHoraNum.format(new Date(iso)));
}

function deduplicar(eventos: EventoAgenda[]): EventoAgenda[] {
  const ordenados = [...eventos].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()
  );
  const resultado: EventoAgenda[] = [];
  for (const ev of ordenados) {
    const dup = resultado.find((r) => {
      if (r.origem === ev.origem) return false;
      const mesmoHorario =
        Math.abs(new Date(r.inicio).getTime() - new Date(ev.inicio).getTime()) <
        2 * 60 * 1000;
      const tituloParecido =
        r.titulo.trim().toLowerCase() === ev.titulo.trim().toLowerCase();
      return mesmoHorario && tituloParecido;
    });
    if (!dup) resultado.push(ev);
  }
  return resultado;
}

type SlotConteudo = { hora: number; eventos: EventoAgenda[] };

function agruparPorSlot(eventos: EventoAgenda[]): SlotConteudo[] {
  const slots: SlotConteudo[] = SLOTS.map((h) => ({ hora: h, eventos: [] }));
  for (const ev of eventos) {
    const h = horaInicio(ev.inicio);
    let idx = slots.findIndex((s) => s.hora === h);
    if (idx < 0) idx = h < HORA_INICIO ? 0 : slots.length - 1;
    slots[idx].eventos.push(ev);
  }
  return slots;
}

const LABEL_ORIGEM: Record<string, string> = {
  google: "GCal",
  "ms-calendar": "Outlook",
  "priority-matrix": "PM",
  "ms-todo": "To Do",
  cockpit: "Cockpit",
};

function EventoBloco({ ev }: { ev: EventoAgenda }) {
  const inicio = new Date(ev.inicio);
  const fim = new Date(ev.fim);
  const fontes = [
    LABEL_ORIGEM[ev.origem] ?? ev.origem,
    ...(ev.fontesExtras ?? []).map((f) => LABEL_ORIGEM[f] ?? f),
  ];
  return (
    <div className="rounded-md ring-1 ring-foreground/10 bg-muted/40 p-2.5 border-l-2 border-l-primary/60">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-mono tabular-nums text-muted-foreground">
          {fmtHora.format(inicio)} — {fmtHora.format(fim)}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {ev.conflitaCom && ev.conflitaCom.length > 0 && (
            <Badge
              variant="destructive"
              className="h-4 gap-1 px-1.5 text-[10px]"
            >
              <AlertTriangle className="h-2.5 w-2.5" /> conflito
            </Badge>
          )}
          <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
            {fontes.join(" + ")}
          </Badge>
        </div>
      </div>
      <p className="mt-0.5 truncate text-sm font-medium">{ev.titulo}</p>
    </div>
  );
}

export function AgendaUnificada({
  eventos,
  erro,
}: {
  eventos: EventoAgenda[];
  erro?: string;
}) {
  const [modo, setModo] = useState<"compacto" | "completo">("compacto");
  const lista = deduplicar(eventos);
  const slots = agruparPorSlot(lista);
  const slotsVisiveis =
    modo === "completo" ? slots : slots.filter((s) => s.eventos.length > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Agenda
          <span className="text-xs font-normal text-muted-foreground">
            08:00–20:00
          </span>
        </CardTitle>
        {lista.length > 0 && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() =>
              setModo((m) => (m === "compacto" ? "completo" : "compacto"))
            }
          >
            {modo === "compacto" ? "Ver grade completa" : "Ver só ocupado"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-4">
        {erro && (
          <p className="mb-3 text-sm text-destructive">
            Falha ao carregar agenda: {erro}
          </p>
        )}
        {lista.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem eventos para hoje.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {slotsVisiveis.map((slot) => {
              const vazio = slot.eventos.length === 0;
              return (
                <div
                  key={slot.hora}
                  className={cn(
                    "grid grid-cols-[3rem_1fr] gap-2",
                    vazio ? "min-h-[1.5rem] items-center" : "py-1"
                  )}
                >
                  <div
                    className={cn(
                      "pt-1 text-xs font-mono tabular-nums",
                      vazio
                        ? "text-muted-foreground/40"
                        : "text-muted-foreground"
                    )}
                  >
                    {String(slot.hora).padStart(2, "0")}:00
                  </div>
                  <div className="min-w-0">
                    {vazio ? (
                      <div className="mt-2.5 h-px bg-border/30" />
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {slot.eventos.map((ev) => (
                          <EventoBloco key={ev.id} ev={ev} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
