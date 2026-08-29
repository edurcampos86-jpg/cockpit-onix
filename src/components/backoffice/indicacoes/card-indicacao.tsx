"use client";

import * as React from "react";
import {
  ChevronDown,
  Clock,
  Heart,
  Loader2,
  Mail,
  MoreVertical,
  Phone,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { COLUNAS_V2, colunaDe, moeda, STATUS_ABERTOS, type Indicacao } from "./tipos";
import {
  dataAbsoluta,
  diasNoFunil,
  rotuloEnvelhecimento,
  tierEnvelhecimento,
} from "./envelhecimento";
import { ConvitesWhatsApp } from "./convites-whatsapp";

export interface CardIndicacaoProps {
  indicacao: Indicacao;
  salvando: boolean;
  recemCriada: boolean;
  /** Nome do cliente vinculado (resolvido pelo board via lista de clientes). */
  nomeClienteVinculado: string | null;
  onMover: (indicacao: Indicacao, novoStatus: string) => void;
  onAgradecer: (indicacao: Indicacao) => void;
  onConverter: (indicacao: Indicacao) => void;
  onDesfazerConversao: (indicacao: Indicacao) => void;
  onRemover: (indicacao: Indicacao) => void;
  /* Presentes só no regime DnD (colunas ≥768px); nas Tabs o card é estático. */
  emArrasto?: boolean;
  refArrasto?: (el: HTMLElement | null) => void;
  atributosArrasto?: React.HTMLAttributes<HTMLElement> & { style?: React.CSSProperties };
}

function LinhaEnvelhecimento({ indicacao }: { indicacao: Indicacao }) {
  const dias = diasNoFunil(indicacao.criadoEm);
  const tier = tierEnvelhecimento(indicacao.status, dias);
  const data = dataAbsoluta(indicacao.criadoEm);

  // Terminais: só a data absoluta (criadoEm, antes carregado e nunca exibido).
  if (tier === null) {
    return (
      <p
        className="text-[11px] text-muted-foreground"
        title={`Entrou no círculo em ${data}`}
      >
        desde {data}
      </p>
    );
  }

  if (tier === "fresco") {
    return (
      <p
        className="text-[11px] text-muted-foreground"
        title={`Entrou no círculo em ${data}`}
      >
        {rotuloEnvelhecimento(dias)}
      </p>
    );
  }

  // Rótulo igual em todos os níveis — a cor comunica a severidade.
  return (
    <Badge
      className={cn(
        "text-[11px]",
        tier === "atencao"
          ? "border border-gold-dark/40 bg-primary/15 text-gold-dark dark:text-gold-light"
          : "border border-destructive/30 bg-destructive/10 text-destructive"
      )}
      title={`Sem mudança de etapa desde ${data}. Toda introdução tem dono — o próximo passo é seu.`}
    >
      <Clock className="h-3 w-3" />
      {rotuloEnvelhecimento(dias)}
    </Badge>
  );
}

export function CardIndicacao({
  indicacao: i,
  salvando,
  recemCriada,
  nomeClienteVinculado,
  onMover,
  onAgradecer,
  onConverter,
  onDesfazerConversao,
  onRemover,
  emArrasto = false,
  refArrasto,
  atributosArrasto,
}: CardIndicacaoProps) {
  const coluna = colunaDe(i.status);
  const temOrigem = !!(i.indicador || i.parceiro);
  const vinculada = !!i.clienteConvertidoId;
  const aberta = STATUS_ABERTOS.includes(i.status);

  return (
    <article
      ref={refArrasto}
      {...atributosArrasto}
      aria-label={
        atributosArrasto ? `Arrastar ${i.nomeIndicado} — etapa atual: ${coluna.label}` : undefined
      }
      className={cn(
        "rounded-lg border border-border bg-card p-3 space-y-1.5 shadow-xs",
        salvando && "opacity-60 pointer-events-none",
        (emArrasto || recemCriada) && "ring-2 ring-primary",
        emArrasto && "shadow-lg rotate-2"
      )}
    >
      {/* linha 1: nome + spinner/overflow */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-sm text-card-foreground">{i.nomeIndicado}</p>
        {salvando ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações de ${i.nomeIndicado}`}
                  className="-mt-1 -mr-1"
                />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {vinculada ? (
                <DropdownMenuItem onClick={() => onDesfazerConversao(i)}>
                  Desfazer conversão
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => onConverter(i)}>
                  Converter em cliente…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => onRemover(i)}>
                Remover…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* origem */}
      {i.parceiro && (
        <p className="text-xs text-muted-foreground">
          Por{" "}
          <a
            href={`/time/parceiros/${i.parceiro.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {i.parceiro.nome}
          </a>{" "}
          <Badge variant="outline" className="text-[11px] uppercase tracking-wide">
            parceiro
          </Badge>
        </p>
      )}
      {i.indicador && (
        <p className="text-xs text-muted-foreground">
          Por <span className="font-medium">{i.indicador.nome}</span> [{i.indicador.classificacao}]
        </p>
      )}

      {/* contato */}
      {i.emailIndicado && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Mail className="h-3 w-3 shrink-0" />
          {i.emailIndicado}
        </p>
      )}
      {i.telefoneIndicado && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Phone className="h-3 w-3 shrink-0" />
          {i.telefoneIndicado}
        </p>
      )}

      {/* valor */}
      {i.valorEstimado != null && (
        <p className="font-mono font-semibold text-sm text-foreground">{moeda(i.valorEstimado)}</p>
      )}

      {/* notas */}
      {i.notas && (
        <p className="text-xs text-muted-foreground italic line-clamp-2" title={i.notas}>
          {i.notas}
        </p>
      )}

      {/* envelhecimento */}
      <LinhaEnvelhecimento indicacao={i} />

      {/* convites sociais — só nas etapas em andamento */}
      {aberta && <ConvitesWhatsApp nomeIndicado={i.nomeIndicado} telefone={i.telefoneIndicado} />}

      {/* rodapé de ações */}
      <div className="flex items-center gap-1 border-t border-border pt-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={salvando}
                aria-label={`Mover ${i.nomeIndicado} — status atual ${coluna.label}`}
                className="flex-1 justify-between font-normal"
              />
            }
          >
            {coluna.label}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuRadioGroup value={i.status}>
              {COLUNAS_V2.map((c) => {
                const Icone = c.icon;
                return (
                  <DropdownMenuRadioItem
                    key={c.id}
                    value={c.id}
                    disabled={c.id === i.status}
                    onClick={() => c.id !== i.status && onMover(i, c.id)}
                  >
                    <Icone className={cn("h-4 w-4", c.corIcone)} />
                    {c.label}
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {i.status === "reuniao" && !vinculada && (
          <Button variant="ghost" size="sm" onClick={() => onConverter(i)}>
            Virou cliente
          </Button>
        )}

        {vinculada && (
          <span
            className="text-xs flex items-center gap-1 text-muted-foreground px-1"
            title={nomeClienteVinculado ? `Vinculada a ${nomeClienteVinculado}` : undefined}
          >
            <UserCheck className="h-3 w-3 text-gold-dark dark:text-primary" />
            Cliente vinculado
          </span>
        )}

        {temOrigem && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={salvando}
                  aria-pressed={i.agradecimentoEnviado}
                  aria-label={
                    i.agradecimentoEnviado
                      ? "Agradecimento enviado — tocar desfaz"
                      : "Agradecer quem fez a introdução"
                  }
                  onClick={() => onAgradecer(i)}
                  className="ml-auto"
                />
              }
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  i.agradecimentoEnviado ? "text-primary fill-primary" : "text-muted-foreground"
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              {i.agradecimentoEnviado
                ? "Agradecimento enviado — tocar desfaz"
                : "Agradecer quem fez a introdução"}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </article>
  );
}
