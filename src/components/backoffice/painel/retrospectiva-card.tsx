"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RetrospectivaPayload } from "@/lib/painel-do-dia/types";

const fmtSemana = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  timeZone: "America/Bahia",
});

export function RetrospectivaCard({
  retro,
}: {
  retro: RetrospectivaPayload;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [expandida, setExpandida] = useState(false);

  const q = retro.metricas.porQuadrante;
  const totalTempo =
    q.Q1.tempoMin + q.Q2.tempoMin + q.Q3.tempoMin + q.Q4.tempoMin;
  const pct = (n: number) => (totalTempo > 0 ? Math.round((n * 100) / totalTempo) : 0);

  async function dispensar() {
    await fetch(`/api/painel-do-dia/retrospectiva/${retro.id}`, {
      method: "PATCH",
      body: JSON.stringify({ dispensada: true }),
      headers: { "Content-Type": "application/json" },
    });
    start(() => router.refresh());
  }

  const aFora = retro.metricas.saudeSupernova.aFora;
  const bFora = retro.metricas.saudeSupernova.bFora;
  const zumbis = retro.metricas.zumbis;

  return (
    <TooltipProvider>
      <Card className="border-blue-300/40 bg-blue-50/30 dark:bg-blue-950/10">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              <h3 className="text-base font-semibold">
                Retrospectiva da semana
              </h3>
              <Badge variant="outline" className="text-xs">
                {fmtSemana.format(new Date(retro.semanaInicio))} –{" "}
                {fmtSemana.format(new Date(retro.semanaFim))}
              </Badge>
              <Tooltip>
                <TooltipTrigger render={<span className="cursor-help" />}>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Relatório automático gerado todo domingo 20h. Mostra como
                  seu tempo foi distribuído (Eisenhower), clientes fora de
                  cadência (Supernova) e ações esquecidas. Dispense quando
                  agir.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setExpandida((v) => !v)}
                className="p-1 text-muted-foreground hover:text-foreground"
                aria-label={expandida ? "Recolher" : "Expandir"}
              >
                {expandida ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <button
                type="button"
                onClick={dispensar}
                disabled={isPending}
                className="p-1 text-muted-foreground hover:text-destructive"
                aria-label="Dispensar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Insight textual */}
          <div className="rounded-md bg-background/60 p-3 text-sm leading-relaxed border border-border">
            <Sparkles className="inline h-3.5 w-3.5 text-blue-600 mr-1" />
            {retro.insight}
          </div>

          {/* Row de métricas-chave */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metrica
              label="Encerradas"
              valor={retro.metricas.totalEncerradas.toString()}
            />
            <Metrica
              label="Tempo total"
              valor={`${Math.round(retro.metricas.tempoTotalMin / 60)}h`}
            />
            <Metrica
              label="% em Q2"
              valor={`${pct(q.Q2.tempoMin)}%`}
              destaque={pct(q.Q2.tempoMin) >= 40}
            />
            <Metrica
              label="% em Q1"
              valor={`${pct(q.Q1.tempoMin)}%`}
              alerta={pct(q.Q1.tempoMin) > 60}
            />
          </div>

          {expandida && (
            <div className="space-y-3 pt-2">
              {(aFora.length > 0 || bFora.length > 0) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Supernova: fora de cadência
                  </p>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">
                    {aFora.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <span className="font-medium text-foreground">{c.nome}</span>{" "}
                        — A, {c.diasSemContato}d sem contato
                      </li>
                    ))}
                    {bFora.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <span className="font-medium text-foreground">{c.nome}</span>{" "}
                        — B, {c.diasSemContato}d sem contato
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {zumbis.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Zumbis (ações &gt; 14 dias):
                  </p>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">
                    {zumbis.slice(0, 5).map((z) => (
                      <li key={z.id}>
                        {z.titulo} <span className="text-[10px]">({z.idadeDias}d)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {retro.metricas.topClientes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Top clientes por tempo:
                  </p>
                  <ul className="text-xs space-y-0.5 text-muted-foreground">
                    {retro.metricas.topClientes.map((c) => (
                      <li key={c.id}>
                        {c.nome}: {c.tempoMin}min
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={dispensar}
              disabled={isPending}
            >
              <Check className="h-3 w-3" /> Li e agi
            </Button>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function Metrica({
  label,
  valor,
  destaque,
  alerta,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <div
      className={
        "rounded-md border p-2 " +
        (destaque
          ? "border-emerald-300/50 bg-emerald-50/60 dark:bg-emerald-950/20"
          : alerta
          ? "border-red-300/50 bg-red-50/60 dark:bg-red-950/20"
          : "border-border bg-background/40")
      }
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-lg font-semibold">{valor}</p>
    </div>
  );
}
