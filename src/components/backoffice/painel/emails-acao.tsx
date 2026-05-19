"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Archive,
  ExternalLink,
  Info,
  Mail,
  MessageSquareReply,
  RefreshCw,
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
import { QuickReplyModal } from "@/components/painel-do-dia/QuickReplyModal";
import type { EmailClassificado } from "@/lib/painel-do-dia/types";

function formatarHaQuantoTempo(iso: string | undefined, agora: number): string | undefined {
  if (!iso) return undefined;
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return undefined;
  const diff = Math.max(0, agora - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

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
  googleConectado = false,
  fetchedAt,
}: {
  emails: EmailClassificado[];
  erro?: string;
  googleConectado?: boolean;
  fetchedAt?: string;
}) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [emailsCliente, setEmailsCliente] = useState<EmailClassificado[] | null>(null);
  const [fetchedAtCliente, setFetchedAtCliente] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [erroRefresh, setErroRefresh] = useState<string | null>(null);
  const [quickReplyEmail, setQuickReplyEmail] = useState<EmailClassificado | null>(null);

  const fonte = emailsCliente ?? emails;
  // Ordena: ação+alta > ação+media > agendamento > cliente_novo > fyi > spam
  const ordenados = [...fonte].sort((a, b) => pesoEmail(b) - pesoEmail(a));
  const ultimaSync = fetchedAtCliente ?? fetchedAt;
  const ultimaSyncTexto = formatarHaQuantoTempo(ultimaSync, Date.now());

  async function atualizar() {
    setRefreshing(true);
    setErroRefresh(null);
    try {
      const res = await fetch("/api/painel-do-dia/emails", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setErroRefresh(data.error ?? `HTTP ${res.status}`);
        return;
      }
      const naoGmail = emails.filter((e) => e.origem !== "gmail");
      const gmailNovo: EmailClassificado[] = data.emails ?? [];
      setEmailsCliente([...naoGmail, ...gmailNovo]);
      if (data.fetchedAt) setFetchedAtCliente(data.fetchedAt);
    } catch (err) {
      setErroRefresh(err instanceof Error ? err.message : "Falha ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> E-mails que pedem ação
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help" />}>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Inbox do Outlook (classificado a cada 15min pela IA) +
                últimas 24h do Gmail filtradas por heurística (assunto
                com &lsquo;?&rsquo;, destinatário direto ou palavras-chave de ação).
              </TooltipContent>
            </Tooltip>
          </CardTitle>
          <div className="flex items-center gap-2">
            {ultimaSyncTexto && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                atualizado {ultimaSyncTexto}
              </span>
            )}
            {googleConectado && (
              <Button
                variant="ghost"
                size="xs"
                onClick={atualizar}
                disabled={refreshing}
                title="Atualizar Gmail"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4">
          {erro && (
            <p className="mb-3 text-sm text-destructive">
              Falha ao carregar e-mails: {erro}
            </p>
          )}
          {erroRefresh && (
            <p className="mb-3 text-sm text-destructive">
              Erro ao atualizar: {erroRefresh}
            </p>
          )}
          {!googleConectado && ordenados.length === 0 ? (
            <div className="rounded-md ring-1 ring-foreground/10 p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                Conecte sua conta Google para ver e-mails que pedem ação.
              </p>
              <Link
                href="/integracoes"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Conectar Gmail
              </Link>
            </div>
          ) : ordenados.length === 0 ? (
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
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={loadingId === e.aiId}
                          onClick={() => arquivar(e)}
                        >
                          <Archive className="h-3 w-3" /> Arquivar
                        </Button>
                        {e.aiId && e.origem === "gmail" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setQuickReplyEmail(e)}
                          >
                            <MessageSquareReply className="h-3 w-3" /> Responder com Claude
                          </Button>
                        )}
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
          {googleConectado && ordenados.some((e) => e.origem === "gmail") && (
            <div className="mt-3 flex justify-end">
              <a
                href="https://mail.google.com/mail/u/0/#inbox"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                Ver todos no Gmail <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>
      <QuickReplyModal
        aiId={quickReplyEmail?.aiId ?? null}
        open={quickReplyEmail !== null}
        onOpenChange={(o) => {
          if (!o) setQuickReplyEmail(null);
        }}
        assunto={quickReplyEmail?.assunto}
        remetente={quickReplyEmail?.remetente}
      />
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
