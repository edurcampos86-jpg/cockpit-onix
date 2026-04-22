"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  Info,
  Mail,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { EmailClassificado } from "@/lib/painel-do-dia/types";

const CORES_QUADRANTE: Record<string, string> = {
  Q1: "border-red-300/60 text-red-700 dark:text-red-300",
  Q2: "border-emerald-300/60 text-emerald-700 dark:text-emerald-300",
  Q3: "border-amber-300/60 text-amber-700 dark:text-amber-300",
  Q4: "border-muted text-muted-foreground",
};

const LABEL_TIPO: Record<string, string> = {
  acao: "ação",
  fyi: "fyi",
  spam: "spam",
  agendamento: "agendamento",
  cliente_novo: "cliente",
};

export function EmailsAcao({
  emails,
  erro,
}: {
  emails: EmailClassificado[];
  erro?: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Ordena: ação+alta > ação+media > agendamento > cliente_novo > fyi > spam
  const ordenados = [...emails].sort((a, b) => pesoEmail(b) - pesoEmail(a));

  async function criarAcao(email: EmailClassificado) {
    if (!email.aiId) return;
    setLoadingId(email.aiId);
    try {
      await fetch(
        `/api/painel-do-dia/emails/${email.aiId}/criar-acao`,
        { method: "POST" }
      );
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  async function arquivar(email: EmailClassificado) {
    if (!email.aiId) return;
    setLoadingId(email.aiId);
    try {
      await fetch(
        `/api/painel-do-dia/emails/${email.aiId}/arquivar`,
        { method: "POST" }
      );
      router.refresh();
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> E-mails que pedem ação
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Inbox do Outlook classificado a cada 15min pela IA em
                ação / fyi / spam / agendamento / cliente novo, com
                quadrante Eisenhower sugerido. Botão ✨ converte em
                AcaoPainel respeitando o prazo e cliente inferidos.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          {erro && (
            <p className="mb-3 text-sm text-destructive">
              Falha ao carregar e-mails: {erro}
            </p>
          )}
          {ordenados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem e-mails pendentes de ação.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ordenados.map((e) => {
                const processado = e.processado;
                const classificado = !!e.tipo;
                return (
                  <li
                    key={e.id}
                    className={cn(
                      "rounded-md ring-1 ring-foreground/10 p-3",
                      processado && "opacity-60",
                      e.tipo === "spam" && "bg-muted/30"
                    )}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {e.remetente}
                      </p>
                      <div className="flex items-center gap-1">
                        {classificado && e.tipo && (
                          <Badge
                            variant="outline"
                            className="h-5 text-[10px]"
                          >
                            {LABEL_TIPO[e.tipo] ?? e.tipo}
                          </Badge>
                        )}
                        {e.quadranteSugerido && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 text-[10px]",
                              CORES_QUADRANTE[e.quadranteSugerido]
                            )}
                          >
                            {e.quadranteSugerido}
                          </Badge>
                        )}
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {e.origem === "gmail" ? "Gmail" : "Outlook"}
                        </Badge>
                      </div>
                    </div>
                    <a
                      href={e.link}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-sm text-primary hover:underline"
                    >
                      {e.assunto}
                    </a>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {e.snippet}
                    </p>
                    {e.tituloAcao && !processado && (
                      <p className="mt-1 text-xs italic text-amber-800 dark:text-amber-300">
                        <Sparkles className="inline h-3 w-3" /> Ação sugerida:{" "}
                        {e.tituloAcao}
                        {e.venceSugerido &&
                          ` · vence ${new Date(e.venceSugerido).toLocaleDateString("pt-BR")}`}
                      </p>
                    )}
                    {e.relacionadoComEventoId && (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <Zap className="h-3 w-3" /> Relacionado a reunião de
                        hoje
                      </div>
                    )}
                    {classificado && !processado && e.tipo !== "spam" && (
                      <div className="mt-2 flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={loadingId === e.aiId}
                          onClick={() => arquivar(e)}
                        >
                          <Archive className="h-3 w-3" /> Arquivar
                        </Button>
                        {(e.tipo === "acao" ||
                          e.tipo === "agendamento" ||
                          e.tipo === "cliente_novo") && (
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={loadingId === e.aiId}
                            onClick={() => criarAcao(e)}
                          >
                            <Sparkles className="h-3 w-3" /> Criar ação
                          </Button>
                        )}
                      </div>
                    )}
                    {processado && (
                      <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ Virou ação no painel
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function pesoEmail(e: EmailClassificado): number {
  if (e.processado) return -10;
  if (e.tipo === "spam") return -5;
  if (e.tipo === "fyi") return 0;
  const urgencia =
    e.urgencia === "alta" ? 20 : e.urgencia === "media" ? 10 : 5;
  const tipoBase =
    e.tipo === "acao" ? 40
    : e.tipo === "agendamento" ? 30
    : e.tipo === "cliente_novo" ? 25
    : 10;
  return tipoBase + urgencia;
}
