import { AlertTriangle, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EventoAgenda } from "@/lib/painel-do-dia/types";

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Bahia",
});

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

export function AgendaUnificada({
  eventos,
  erro,
}: {
  eventos: EventoAgenda[];
  erro?: string;
}) {
  const lista = deduplicar(eventos);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" /> Agenda
        </CardTitle>
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
          <ul className="flex flex-col gap-2">
            {lista.map((ev) => (
              <li
                key={ev.id}
                className="flex items-center justify-between gap-3 rounded-md ring-1 ring-foreground/10 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {fmtHora.format(new Date(ev.inicio))} —{" "}
                    {fmtHora.format(new Date(ev.fim))}
                  </p>
                  <p className="text-sm truncate">{ev.titulo}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {ev.conflitaCom && ev.conflitaCom.length > 0 && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> conflito
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {ev.origem === "google" ? "GCal" : "Outlook"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
