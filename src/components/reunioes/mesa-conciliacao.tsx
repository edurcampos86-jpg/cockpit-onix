"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  FileWarning,
  Mic2,
  Route,
  ShieldCheck,
  UserRoundSearch,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  EstadoConciliacao,
  PlaudConciliacaoItem,
  PlaudConciliacaoPayload,
} from "@/lib/reunioes/conciliacao";
import { cn } from "@/lib/utils";

const ESTADO: Record<
  EstadoConciliacao,
  { titulo: string; detalhe: string; classe: string; Icone: typeof AlertTriangle }
> = {
  sem_transcricao: {
    titulo: "Sem transcrição",
    detalhe: "A gravação entrou sem texto para revisão.",
    classe: "border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300",
    Icone: FileWarning,
  },
  ambiguo: {
    titulo: "Mais de um cliente possível",
    detalhe: "O nome apareceu em mais de uma ficha. Nenhuma foi escolhida.",
    classe: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300",
    Icone: UsersRound,
  },
  sem_cliente: {
    titulo: "Cliente não identificado",
    detalhe: "A transcrição não foi enviada a nenhuma ficha.",
    classe: "border-orange-500/30 bg-orange-500/5 text-orange-700 dark:text-orange-300",
    Icone: UserRoundSearch,
  },
  cliente_sugerido: {
    titulo: "Cliente sugerido — não confirmado",
    detalhe: "Confira o nome antes de abrir a revisão na ficha.",
    classe: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-300",
    Icone: ShieldCheck,
  },
};

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Bahia",
});

function Sinal({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", destaque && "border-amber-500/30 bg-amber-500/5")}>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}

function ObservabilidadeIndisponivel() {
  return (
    <div className="grid gap-2 sm:grid-cols-4" aria-label="Indicadores ainda indisponíveis">
      {["Último sincronismo", "Importadas na ficha", "Aguardando revisão", "Falhas"].map(
        (rotulo) => (
          <div key={rotulo} className="rounded-lg border border-dashed bg-muted/20 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{rotulo}</p>
            <p className="text-sm font-medium">Indisponível</p>
          </div>
        ),
      )}
    </div>
  );
}

function ItemConciliacao({ item }: { item: PlaudConciliacaoItem }) {
  const [aberto, setAberto] = useState(false);
  const meta = ESTADO[item.estado];
  const painelId = `detalhe-plaud-${item.id}`;

  return (
    <article id={`plaud-item-${item.id}`} className="scroll-mt-6 rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        onClick={() => setAberto((atual) => !atual)}
        className="flex min-h-11 w-full items-start gap-3 rounded-xl p-4 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className={cn("mt-0.5 rounded-lg border p-2", meta.classe)}>
          <meta.Icone className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{item.titulo}</span>
          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{fmtData.format(new Date(item.data))}</span>
            {item.duracaoMin !== null && <span>{item.duracaoMin} min</span>}
            <span className="font-medium text-foreground">{meta.titulo}</span>
          </span>
        </span>
        <ChevronDown
          className={cn("mt-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform", aberto && "rotate-180")}
          aria-hidden
        />
      </button>

      {aberto && (
        <div id={painelId} className="space-y-4 border-t px-4 py-4">
          <div className={cn("rounded-lg border px-3 py-2", meta.classe)}>
            <p className="text-sm font-medium">{meta.titulo}</p>
            <p className="text-xs opacity-90">{meta.detalhe}</p>
          </div>

          {item.clienteSugerido && (
            <div className="rounded-lg border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Sugestão por nome — exige conferência humana
              </p>
              <p className="mt-1 text-sm font-semibold">{item.clienteSugerido.nome}</p>
              <p className="text-xs text-muted-foreground">{item.clienteSugerido.evidencia}</p>
            </div>
          )}

          {item.clienteAmbiguo && (
            <p className="text-sm">
              Nome ambíguo: <strong>{item.clienteAmbiguo}</strong>
            </p>
          )}

          {item.participantes.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Participantes informados
              </p>
              <p className="mt-1 text-sm">{item.participantes.join(" · ")}</p>
            </div>
          )}

          {item.previewUrl ? (
            <Button className="min-h-11" render={<Link href={item.previewUrl} />}>
              Revisar na ficha de {item.clienteSugerido?.nome}
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : item.estado === "cliente_sugerido" && item.temTranscricao ? (
            <p className="text-xs text-muted-foreground">
              O preview fica disponível quando o Cockpit de Reunião estiver ligado.
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function MesaConciliacao({ payload }: { payload: PlaudConciliacaoPayload }) {
  const prioridade = useMemo(
    () => payload.items.find((item) => item.estado !== "cliente_sugerido") ?? null,
    [payload.items],
  );
  const ultimaEntrada = payload.metricas.ultimaEntradaRegistradaEm
    ? fmtData.format(new Date(payload.metricas.ultimaEntradaRegistradaEm))
    : "Nenhuma entrada nesta lista";

  function irParaPrioridade() {
    if (!prioridade) return;
    document.getElementById(`plaud-item-${prioridade.id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="gap-3 border-b bg-primary/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mic2 className="h-5 w-5 text-primary" /> Mesa de conciliação
                <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  somente leitura
                </span>
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Última entrada registrada: {ultimaEntrada}
              </p>
            </div>
            {prioridade && (
              <Button className="min-h-11" type="button" onClick={irParaPrioridade}>
                Revisar próxima exceção <ArrowDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Sinal rotulo="Gravações nesta lista" valor={payload.metricas.recebidasNestaLista} />
            <Sinal
              rotulo="Com sugestão nominal"
              valor={payload.metricas.comSugestaoNominalNestaLista}
            />
            <Sinal
              rotulo="Exceções nesta lista"
              valor={payload.metricas.excecoesNestaLista}
              destaque={payload.metricas.excecoesNestaLista > 0}
            />
          </div>
          <ObservabilidadeIndisponivel />
          <p className="text-[11px] text-muted-foreground">{payload.janela.descricao}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Route className="h-4 w-4 text-primary" /> Disponível hoje
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
          <div className="rounded-lg border p-3">
            <p className="font-medium">Zapier ou Google Drive</p>
            <p className="text-xs text-muted-foreground">Entrada atual</p>
          </div>
          <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <div className="rounded-lg border p-3">
            <p className="font-medium">Cliente sugerido</p>
            <p className="text-xs text-muted-foreground">Coincidência nominal, não confirmação</p>
          </div>
          <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <div className="rounded-lg border p-3">
            <p className="font-medium">Revisão na ficha</p>
            <p className="text-xs text-muted-foreground">Nada é salvo antes do preview</p>
          </div>
        </CardContent>
      </Card>

      {payload.items.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <Mic2 className="mb-3 h-9 w-9 text-muted-foreground/40" />
            <p className="font-medium">Nenhuma gravação Plaud visível nesta lista</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Isso é diferente de uma mesa zerada: o último sincronismo ainda não é observável.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-3" aria-labelledby="fila-plaud-titulo">
          <div className="flex items-center justify-between gap-3">
            <h2 id="fila-plaud-titulo" className="text-base font-semibold">
              Fila por prioridade
            </h2>
            {!prioridade && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Sem exceções nesta lista
              </span>
            )}
          </div>
          {payload.items.map((item) => (
            <ItemConciliacao key={item.id} item={item} />
          ))}
        </section>
      )}

      <div className="rounded-xl border border-dashed bg-muted/20 p-4" aria-label="Visão planejada">
        <div className="flex items-start gap-3">
          <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">Planejado · exige migration, credencial e escrita</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Plaud CLI oficial → confirmação do cliente → revisão por item → recibo de distribuição
              para Painel do Dia, Cadência, Calendário, Storyselling, Corretora, Relatórios e Memórias.
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              O PAT orienta a conversa, não a recomendação de produto. A suitability continua obrigatória.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
