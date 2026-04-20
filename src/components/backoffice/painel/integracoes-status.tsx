import { Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" /> Fontes do Painel
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 px-4 sm:grid-cols-2 lg:grid-cols-3">
        {integracoes.map((i) => (
          <div
            key={i.provider}
            className="flex items-center justify-between rounded-md ring-1 ring-foreground/10 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{rotulo[i.provider]}</p>
              {i.ultimaSincronizacao && (
                <p className="text-xs text-muted-foreground">
                  Última sync: {fmtDataHora.format(new Date(i.ultimaSincronizacao))}
                </p>
              )}
              {i.mensagemErro && (
                <p className="text-xs text-destructive">{i.mensagemErro}</p>
              )}
            </div>
            <Badge variant={statusVariant[i.status]} className="shrink-0">
              {statusLabel[i.status]}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
