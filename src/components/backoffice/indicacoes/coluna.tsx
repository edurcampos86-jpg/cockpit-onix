"use client";

import * as React from "react";
import { Draggable, Droppable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ColunaDef, Indicacao } from "./tipos";
import { CardIndicacao, type CardIndicacaoProps } from "./card-indicacao";

export type HandlersCard = Pick<
  CardIndicacaoProps,
  "onMover" | "onAgradecer" | "onConverter" | "onDesfazerConversao" | "onRemover"
>;

/** Empty state por coluna — aponta a próxima ação, não constata o vazio. */
export function EmptyColuna({
  coluna,
  termoBusca,
  onNova,
}: {
  coluna: ColunaDef;
  termoBusca: string;
  onNova: () => void;
}) {
  const Icone = coluna.icon;
  return (
    <div className="py-6 text-center space-y-2">
      <Icone className="h-5 w-5 text-muted-foreground/50 mx-auto" aria-hidden="true" />
      <p className="text-xs text-muted-foreground">
        {termoBusca ? `Nenhum resultado para '${termoBusca}'` : coluna.vazio}
      </p>
      {!termoBusca && coluna.id === "recebida" && (
        <Button variant="ghost" size="sm" onClick={onNova}>
          Registrar
        </Button>
      )}
    </div>
  );
}

export function Coluna({
  coluna,
  lista,
  termoBusca,
  salvandoIds,
  recemCriadaId,
  nomeClientePorId,
  handlers,
  onNova,
}: {
  coluna: ColunaDef;
  lista: Indicacao[];
  termoBusca: string;
  salvandoIds: Set<string>;
  recemCriadaId: string | null;
  nomeClientePorId: (clienteId: string | null) => string | null;
  handlers: HandlersCard;
  onNova: () => void;
}) {
  const Icone = coluna.icon;
  return (
    <section
      aria-label={`${coluna.label} — ${lista.length} introduções`}
      className={cn(
        "rounded-xl border border-border border-t-2 bg-secondary/50 p-3 min-h-[300px]",
        "md:w-[280px] md:shrink-0 md:snap-start xl:w-auto",
        coluna.corFilete
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <div tabIndex={0} className="flex items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            }
          >
            <Icone className={cn("h-4 w-4", coluna.corIcone)} aria-hidden="true" />
            <h4 className="font-semibold text-sm text-foreground">{coluna.label}</h4>
          </TooltipTrigger>
          <TooltipContent>{coluna.tooltip}</TooltipContent>
        </Tooltip>
        <Badge variant="secondary" className="ml-auto tabular-nums" aria-hidden="true">
          {lista.length}
        </Badge>
      </div>
      <Droppable droppableId={coluna.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "space-y-2 min-h-[220px] rounded-lg transition-colors",
              snapshot.isDraggingOver && "bg-primary/5"
            )}
          >
            {lista.map((i, idx) => (
              <Draggable key={i.id} draggableId={i.id} index={idx}>
                {(dragProvided, dragSnapshot) => (
                  <CardIndicacao
                    indicacao={i}
                    salvando={salvandoIds.has(i.id)}
                    recemCriada={recemCriadaId === i.id}
                    nomeClienteVinculado={nomeClientePorId(i.clienteConvertidoId)}
                    emArrasto={dragSnapshot.isDragging}
                    refArrasto={dragProvided.innerRef}
                    atributosArrasto={{
                      ...dragProvided.draggableProps,
                      ...dragProvided.dragHandleProps,
                    }}
                    {...handlers}
                  />
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {lista.length === 0 && (
              <EmptyColuna coluna={coluna} termoBusca={termoBusca} onNova={onNova} />
            )}
          </div>
        )}
      </Droppable>
    </section>
  );
}
