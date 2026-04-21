"use client";

import { AlertTriangle, Info, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { IntegracaoStatus } from "@/lib/painel-do-dia/types";

const rotulo: Record<IntegracaoStatus["provider"], string> = {
  google: "Google (Calendar + Gmail)",
  microsoft: "Microsoft (Outlook + To Do) — cowork",
  "priority-matrix": "Priority Matrix — cowork",
  plaud: "Plaud AI",
  datacrazy: "Datacrazy CRM",
};

const statusVariant: Record<
  IntegracaoStatus["status"],
  "default" | "outline" | "destructive" | "secondary"
> = {
  conectado: "default",
  desconectado: "outline",
  erro: "destructive",
  "em-breve": "secondary",
};

const statusLabel: Record<IntegracaoStatus["status"], string> = {
  conectado: "Conectado",
  desconectado: "Não conectado",
  erro: "Erro",
  "em-breve": "Em breve",
};

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Bahia",
});

export function IntegracoesStatus({
  integracoes,
}: {
  integracoes: IntegracaoStatus[];
}) {
  const microsoftExpirada = integracoes.find(
    (i) => i.provider === "microsoft" && i.sessaoExpirada
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" /> Fontes do Painel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 px-4">
          {microsoftExpirada && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <p className="font-medium text-destructive">
                  Sessão Microsoft expirada
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {microsoftExpirada.mensagemErro ??
                    "Última sincronia há mais de 24h — banco pode ter deslogado. Reabra o Outlook/To Do no Edge."}
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {integracoes.map((i) => {
              const card = (
                <div
                  className={cn(
                    "flex items-center justify-between rounded-md ring-1 ring-foreground/10 p-3",
                    i.sessaoExpirada && "ring-destructive/40 bg-destructive/5",
                    i.status === "em-breve" && "opacity-75"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-1.5">
                      {rotulo[i.provider]}
                      {i.status === "em-breve" && i.roadmapInfo && (
                        <Info className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                    </p>
                    {i.ultimaSincronizacao && (
                      <p className="text-xs text-muted-foreground">
                        Última sync:{" "}
                        {fmtDataHora.format(new Date(i.ultimaSincronizacao))}
                      </p>
                    )}
                    {i.mensagemErro && !i.sessaoExpirada && (
                      <p className="text-xs text-destructive">
                        {i.mensagemErro}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariant[i.status]} className="shrink-0">
                    {statusLabel[i.status]}
                  </Badge>
                </div>
              );

              if (i.status === "em-breve" && i.roadmapInfo) {
                return (
                  <Tooltip key={i.provider}>
                    <TooltipTrigger
                      render={<div className="cursor-help" />}
                    >
                      {card}
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      {i.roadmapInfo}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <div key={i.provider}>{card}</div>;
            })}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
