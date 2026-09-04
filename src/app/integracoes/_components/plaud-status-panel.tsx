"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CircleDashed, Clock3, Mic2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PlaudConciliacaoPayload } from "@/lib/reunioes/conciliacao";

const fmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bahia",
});

export function PlaudStatusPanel() {
  const [payload, setPayload] = useState<PlaudConciliacaoPayload | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const res = await fetch("/api/meetings/conciliacao?limit=50");
        if (res.status === 404) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlaudConciliacaoPayload;
        if (cancelado) return;
        setPayload(data);
        setVisivel(true);
      } catch {
        if (cancelado) return;
        setErro("O diagnóstico Plaud não respondeu. Nenhum estado foi presumido.");
        setVisivel(true);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  if (!visivel) return null;

  return (
    <Card className="border-primary/25" aria-live="polite">
      <CardHeader className="border-b bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic2 className="h-5 w-5 text-primary" /> Plaud — ingestão e conciliação
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Entrada atual por Zapier ou Drive; associação nominal sempre exige conferência.
            </p>
          </div>
          <Button className="min-h-11" render={<Link href="/reunioes" />}>
            Abrir conciliação <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6">
        {erro ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {erro}
          </p>
        ) : payload ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {payload.metricas.recebidasNestaLista}
                </p>
                <p className="text-xs text-muted-foreground">Recebidas nesta lista</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {payload.metricas.comSugestaoNominalNestaLista}
                </p>
                <p className="text-xs text-muted-foreground">Com sugestão nominal</p>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xl font-semibold tabular-nums">
                  {payload.metricas.excecoesNestaLista}
                </p>
                <p className="text-xs text-muted-foreground">Exceções nesta lista</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                Última entrada registrada: {payload.metricas.ultimaEntradaRegistradaEm
                  ? fmt.format(new Date(payload.metricas.ultimaEntradaRegistradaEm))
                  : "nenhuma nesta lista"}
              </span>
              <span>Último sincronismo · Importadas · Revisão · Falhas: indisponíveis nesta fase</span>
            </div>
          </>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" /> Disponível hoje
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Zapier/Drive → cliente sugerido → preview e revisão na ficha.
            </p>
          </div>
          <div className="rounded-lg border border-dashed bg-muted/20 p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleDashed className="h-4 w-4 text-muted-foreground" /> Planejado
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Plaud CLI oficial como entrada principal; Zapier como contingência; MCP somente para consultas.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
