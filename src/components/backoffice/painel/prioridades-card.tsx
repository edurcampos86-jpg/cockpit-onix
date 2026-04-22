"use client";

import { Check, Clock, Info, Sparkles, Target, X, Zap } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Prioridade } from "@/lib/painel-do-dia/types";

export function PrioridadesCard({
  prioridades,
  data,
}: {
  prioridades: Prioridade[];
  data: string;
}) {
  const router = useRouter();
  const slots: (1 | 2 | 3)[] = [1, 2, 3];
  const porPosicao = new Map(prioridades.map((p) => [p.posicao, p]));
  const [textos, setTextos] = useState<Record<number, string>>(() =>
    slots.reduce(
      (acc, pos) => ({ ...acc, [pos]: porPosicao.get(pos)?.texto ?? "" }),
      {}
    )
  );
  const [tempos, setTempos] = useState<Record<number, string>>(() =>
    slots.reduce(
      (acc, pos) => ({
        ...acc,
        [pos]: porPosicao.get(pos)?.tempoEstimadoMin?.toString() ?? "",
      }),
      {}
    )
  );
  const [loading, setLoading] = useState<number | null>(null);

  const haSugestoes = prioridades.some((p) => p.sugeridaPorBoot);

  async function salvar(posicao: 1 | 2 | 3) {
    const texto = textos[posicao]?.trim();
    if (!texto) return;
    const tempoStr = tempos[posicao];
    const tempoEstimadoMin = tempoStr ? Number(tempoStr) : null;
    await fetch("/api/painel-do-dia/prioridades", {
      method: "POST",
      body: JSON.stringify({ data, posicao, texto, tempoEstimadoMin }),
      headers: { "Content-Type": "application/json" },
    });
    router.refresh();
  }

  async function alternar(posicao: 1 | 2 | 3) {
    const existente = porPosicao.get(posicao);
    if (!existente) return;
    await fetch(`/api/painel-do-dia/prioridades/${existente.id}`, {
      method: "PATCH",
      body: JSON.stringify({ concluida: !existente.concluida }),
      headers: { "Content-Type": "application/json" },
    });
    router.refresh();
  }

  async function aceitarSugestao(posicao: 1 | 2 | 3) {
    const p = porPosicao.get(posicao);
    if (!p) return;
    await fetch(`/api/painel-do-dia/prioridades/${p.id}`, {
      method: "PATCH",
      body: JSON.stringify({ aceitarSugestao: true }),
      headers: { "Content-Type": "application/json" },
    });
    router.refresh();
  }

  async function rejeitarSugestao(posicao: 1 | 2 | 3) {
    const p = porPosicao.get(posicao);
    if (!p) return;
    await fetch(`/api/painel-do-dia/prioridades/${p.id}`, {
      method: "DELETE",
    });
    setTextos((t) => ({ ...t, [posicao]: "" }));
    router.refresh();
  }

  async function aceitarTodas() {
    setLoading(0);
    await fetch("/api/painel-do-dia/prioridades/aceitar-sugestoes", {
      method: "POST",
      body: JSON.stringify({ data }),
      headers: { "Content-Type": "application/json" },
    });
    setLoading(null);
    router.refresh();
  }

  async function bloquearFoco(posicao: 1 | 2 | 3) {
    const p = porPosicao.get(posicao);
    if (!p || !p.tempoEstimadoMin) return;
    setLoading(posicao);
    try {
      await fetch(`/api/painel-do-dia/prioridades/${p.id}/focus-block`, {
        method: "POST",
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  async function removerFoco(posicao: 1 | 2 | 3) {
    const p = porPosicao.get(posicao);
    if (!p) return;
    setLoading(posicao);
    try {
      await fetch(`/api/painel-do-dia/prioridades/${p.id}/focus-block`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" /> 3 Prioridades do Dia
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                As 3 coisas que, se feitas hoje, tornam o dia um sucesso.
                Método MIT (Most Important Tasks). O Boot do Dia (07:30 Bahia)
                pré-sugere candidatos automaticamente.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {haSugestoes && (
            <div className="mx-4 flex items-center justify-between gap-2 rounded-md border border-amber-300/40 bg-amber-50 dark:bg-amber-950/20 p-2 text-xs">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-amber-900 dark:text-amber-200">
                  Sugestões do Boot do Dia. Aceite, edite ou substitua.
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={aceitarTodas}
                disabled={loading === 0}
              >
                <Check className="h-3 w-3" /> Aceitar todas
              </Button>
            </div>
          )}

          {slots.map((posicao) => {
            const p = porPosicao.get(posicao);
            const sugerida = p?.sugeridaPorBoot;
            const temFoco = !!p?.focusBlockEventId;

            return (
              <div key={posicao} className="flex flex-col gap-1 px-4">
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                    {posicao}
                  </span>
                  <Checkbox
                    checked={p?.concluida ?? false}
                    disabled={!p || sugerida}
                    onCheckedChange={() => alternar(posicao)}
                  />
                  <Input
                    className={cn(
                      "flex-1",
                      p?.concluida && "line-through text-muted-foreground",
                      sugerida &&
                        "border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/10 italic text-amber-900 dark:text-amber-200"
                    )}
                    placeholder={`Prioridade ${posicao}...`}
                    value={textos[posicao] ?? ""}
                    onChange={(e) =>
                      setTextos((t) => ({ ...t, [posicao]: e.target.value }))
                    }
                    onBlur={() => salvar(posicao)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <Input
                    type="number"
                    min={15}
                    step={15}
                    placeholder="min"
                    className="w-20"
                    title="Tempo estimado (min) — alimenta o auto-bloqueio de foco"
                    value={tempos[posicao] ?? ""}
                    onChange={(e) =>
                      setTempos((t) => ({ ...t, [posicao]: e.target.value }))
                    }
                    onBlur={() => salvar(posicao)}
                  />
                </div>
                <div className="ml-8 flex items-center gap-2 flex-wrap">
                  {sugerida && p?.bootMotivo && (
                    <Badge
                      variant="outline"
                      className="h-5 border-amber-300/60 text-[10px] text-amber-800 dark:text-amber-200"
                    >
                      <Sparkles className="h-2.5 w-2.5" /> {p.bootMotivo}
                    </Badge>
                  )}
                  {sugerida && (
                    <>
                      <button
                        type="button"
                        onClick={() => aceitarSugestao(posicao)}
                        className="text-xs text-amber-700 hover:underline"
                      >
                        aceitar
                      </button>
                      <span className="text-muted-foreground">·</span>
                      <button
                        type="button"
                        onClick={() => rejeitarSugestao(posicao)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        dispensar
                      </button>
                    </>
                  )}
                  {!sugerida && p && p.tempoEstimadoMin && !temFoco && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-xs px-2"
                      onClick={() => bloquearFoco(posicao)}
                      disabled={loading === posicao}
                    >
                      <Zap className="h-3 w-3" /> Bloquear foco
                      ({p.tempoEstimadoMin}min)
                    </Button>
                  )}
                  {temFoco && p?.focusBlockStart && (
                    <Badge
                      variant="outline"
                      className="h-5 border-emerald-300/60 text-[10px] text-emerald-700 dark:text-emerald-300"
                    >
                      <Clock className="h-2.5 w-2.5" />
                      Foco agendado{" "}
                      {new Date(p.focusBlockStart).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "America/Bahia",
                      })}
                      {p.focusBlockProvider === "pending-cowork" && " (pending)"}
                      <button
                        type="button"
                        onClick={() => removerFoco(posicao)}
                        className="ml-1 text-emerald-600 hover:text-destructive"
                        title="Remover bloco de foco"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
