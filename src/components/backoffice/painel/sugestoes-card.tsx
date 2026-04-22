"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  AlertCircle,
  Clock,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SugestaoPainelPayload } from "@/lib/painel-do-dia/types";

export function SugestoesCard({
  sugestoes,
}: {
  sugestoes: SugestaoPainelPayload[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  if (sugestoes.length === 0) return null;

  async function acao(id: string, status: "accepted" | "snoozed" | "dismissed") {
    await fetch(`/api/painel-do-dia/sugestoes/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        snoozeMinutes: status === "snoozed" ? 30 : undefined,
      }),
      headers: { "Content-Type": "application/json" },
    });
    start(() => router.refresh());
  }

  return (
    <TooltipProvider>
      <Card className="border-amber-300/40 bg-amber-50/30 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-600" />
            Sugestões da automação
            <Badge variant="outline" className="text-xs">
              {sugestoes.length}
            </Badge>
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Cards disparados pelos crons — auto-encerramento
                pós-reunião, clientes fora de cadência Supernova, ações
                zumbi. Aceite, adie 30min ou dispense.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-4">
          {sugestoes.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-amber-200/50 bg-background/60 p-3 text-sm"
            >
              <div className="flex items-start gap-2">
                <IconeSugestao tipo={s.tipo} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{s.titulo}</p>
                  {s.descricao && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.descricao}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => acao(s.id, "dismissed")}
                  disabled={isPending}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Dispensar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => acao(s.id, "snoozed")}
                  disabled={isPending}
                >
                  <Clock className="h-3 w-3" /> Adiar 30min
                </Button>
                {s.tipo === "encerrar-reuniao" && (
                  <Button
                    size="sm"
                    onClick={() => acao(s.id, "accepted")}
                    disabled={isPending}
                  >
                    Registrar toque
                  </Button>
                )}
                {s.tipo === "cliente-fora-cadencia" && (
                  <Button
                    size="sm"
                    onClick={() => acao(s.id, "accepted")}
                    disabled={isPending}
                  >
                    Adicionar ao dia
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function IconeSugestao({ tipo }: { tipo: SugestaoPainelPayload["tipo"] }) {
  if (tipo === "encerrar-reuniao")
    return <Clock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
  if (tipo === "cliente-fora-cadencia")
    return <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
  return <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />;
}
