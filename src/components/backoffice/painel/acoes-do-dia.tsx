"use client";

import {
  CheckSquare,
  Info,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  Clock,
  Repeat,
  Zap,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  AcaoUnificada,
  CriarAcaoInput,
  OrigemAcao,
  QuadrantePM,
} from "@/lib/painel-do-dia/types";
import { FecharAtividadeModal } from "./fechar-atividade-modal";

type DestinoSelecionado =
  | "local"
  | "ms-todo"
  | "priority-matrix:Q1"
  | "priority-matrix:Q2"
  | "priority-matrix:Q3"
  | "priority-matrix:Q4";

type Camada = "hoje" | "atrasadas" | "proximas-48h" | "rituais";

const rotuloOrigem: Record<OrigemAcao, string> = {
  local: "Local",
  "ms-todo": "MS To Do",
  "priority-matrix": "Priority Matrix",
};

const QUADRANTES: Array<{
  id: QuadrantePM;
  titulo: string;
  hint: string;
  tom: string;
  icon: typeof Zap;
}> = [
  {
    id: "Q1",
    titulo: "Q1 · Crítico & Urgente",
    hint: "Fazer agora",
    tom: "border-destructive/40 bg-destructive/5",
    icon: Zap,
  },
  {
    id: "Q2",
    titulo: "Q2 · Importante",
    hint: "Agendar",
    tom: "border-amber-500/40 bg-amber-500/5",
    icon: CalendarClock,
  },
  {
    id: "Q3",
    titulo: "Q3 · Urgente não crítico",
    hint: "Delegar / bater rápido",
    tom: "border-sky-500/40 bg-sky-500/5",
    icon: Clock,
  },
  {
    id: "Q4",
    titulo: "Q4 · Rotina",
    hint: "Fazer depois ou eliminar",
    tom: "border-border bg-muted/30",
    icon: Repeat,
  },
];

const FILTROS: Array<{
  id: Camada;
  label: string;
  icon: typeof Zap;
}> = [
  { id: "hoje", label: "Hoje", icon: Zap },
  { id: "atrasadas", label: "Atrasadas", icon: AlertTriangle },
  { id: "proximas-48h", label: "Próximas 48h", icon: CalendarClock },
  { id: "rituais", label: "Rituais", icon: Repeat },
];

const REGEX_RITUAL =
  /(semanal|mensal|quinzenal|di[aá]ri[oa]|recorrente|toda\s+(segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)|todo\s+dia)/i;

function diasAte(vence: string, hoje: Date): number {
  const d = new Date(vence);
  const diffMs = d.getTime() - hoje.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function classificarCamada(a: AcaoUnificada, hoje: Date): Camada | null {
  if (a.concluida) return null;
  if (REGEX_RITUAL.test(a.titulo)) return "rituais";
  if (a.vence) {
    const diff = diasAte(a.vence, hoje);
    if (diff < 0) return "atrasadas";
    if (diff === 0) return "hoje";
    if (diff <= 2) return "proximas-48h";
    return null;
  }
  return a.noMeuDia ? "hoje" : null;
}

function quadranteDe(a: AcaoUnificada): QuadrantePM {
  if (a.quadrante) return a.quadrante;
  return a.importante ? "Q2" : "Q4";
}

export function AcoesDoDia({
  acoes,
  erro,
}: {
  acoes: AcaoUnificada[];
  erro?: string;
}) {
  const router = useRouter();
  const [novoTitulo, setNovoTitulo] = useState("");
  const [destino, setDestino] = useState<DestinoSelecionado>("local");
  const [camada, setCamada] = useState<Camada>("hoje");
  const [isPending, start] = useTransition();
  const [acaoParaEncerrar, setAcaoParaEncerrar] =
    useState<AcaoUnificada | null>(null);

  const hoje = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { contagem, porQuadrante } = useMemo(() => {
    const contagem: Record<Camada, number> = {
      hoje: 0,
      atrasadas: 0,
      "proximas-48h": 0,
      rituais: 0,
    };
    const porQuadrante: Record<QuadrantePM, AcaoUnificada[]> = {
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: [],
    };
    for (const a of acoes) {
      const c = classificarCamada(a, hoje);
      if (!c) continue;
      contagem[c]++;
      if (c === camada) porQuadrante[quadranteDe(a)].push(a);
    }
    return { contagem, porQuadrante };
  }, [acoes, camada, hoje]);

  function parseDestino(d: DestinoSelecionado): {
    origem: OrigemAcao;
    quadrante?: QuadrantePM;
  } {
    if (d.startsWith("priority-matrix:")) {
      return {
        origem: "priority-matrix",
        quadrante: d.split(":")[1] as QuadrantePM,
      };
    }
    return { origem: d as OrigemAcao };
  }

  async function criar() {
    const titulo = novoTitulo.trim();
    if (!titulo) return;
    const { origem, quadrante } = parseDestino(destino);
    const body: CriarAcaoInput = { titulo, origem, quadrante, noMeuDia: true };
    await fetch("/api/painel-do-dia/acoes", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    setNovoTitulo("");
    start(() => router.refresh());
  }

  async function toggle(acao: AcaoUnificada) {
    // Ao marcar como concluida, abre o modal de encerramento estruturado.
    // Desmarcar volta direto a ser PATCH simples.
    if (!acao.concluida) {
      setAcaoParaEncerrar(acao);
      return;
    }
    await fetch(`/api/painel-do-dia/acoes/${acao.id}`, {
      method: "PATCH",
      body: JSON.stringify({ concluida: false }),
      headers: { "Content-Type": "application/json" },
    });
    start(() => router.refresh());
  }

  async function excluir(acao: AcaoUnificada) {
    await fetch(`/api/painel-do-dia/acoes/${acao.id}`, { method: "DELETE" });
    start(() => router.refresh());
  }

  async function moverQuadrante(acao: AcaoUnificada, novo: QuadrantePM) {
    await fetch(`/api/painel-do-dia/acoes/${acao.id}`, {
      method: "PATCH",
      body: JSON.stringify({ quadrante: novo }),
      headers: { "Content-Type": "application/json" },
    });
    start(() => router.refresh());
  }

  return (
    <TooltipProvider>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5" /> Ações do Dia
          <Tooltip>
            <TooltipTrigger render={<span className="cursor-help" />}>
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">
              Todas as suas ações unificadas (Local + MS To Do + Priority
              Matrix) organizadas pela matriz de Eisenhower. Q1=crítico+urgente,
              Q2=importante (foco), Q3=urgente+não-crítico (delegar),
              Q4=rotina. Filtros no topo limitam por prazo: Hoje (vence
              hoje ou &ldquo;no meu dia&rdquo;), Atrasadas, Próximas 48h, Rituais
              (recorrentes). Ao marcar concluída abre modal de encerramento
              com tempo gasto, cliente e próximo passo.
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {erro && (
          <p className="mb-3 text-sm text-destructive">
            Falha ao carregar ações: {erro}
          </p>
        )}

        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const ativo = camada === f.id;
            const Icon = f.icon;
            const qtd = contagem[f.id];
            return (
              <Button
                key={f.id}
                size="xs"
                variant={ativo ? "default" : "outline"}
                onClick={() => setCamada(f.id)}
                className="gap-1.5"
              >
                <Icon className="h-3 w-3" />
                {f.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-[10px] font-mono tabular-nums",
                    ativo
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {qtd}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Nova ação..."
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") criar();
            }}
            className="flex-1"
          />
          <Select
            value={destino}
            onValueChange={(v) => setDestino(v as DestinoSelecionado)}
          >
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local">Local</SelectItem>
              <SelectItem value="ms-todo">MS To Do</SelectItem>
              <SelectItem value="priority-matrix:Q1">
                Priority Matrix — Q1
              </SelectItem>
              <SelectItem value="priority-matrix:Q2">
                Priority Matrix — Q2
              </SelectItem>
              <SelectItem value="priority-matrix:Q3">
                Priority Matrix — Q3
              </SelectItem>
              <SelectItem value="priority-matrix:Q4">
                Priority Matrix — Q4
              </SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={criar} disabled={!novoTitulo.trim() || isPending}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        {acoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação no painel. Use o campo acima pra criar.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {QUADRANTES.map((q) => {
              const itens = porQuadrante[q.id];
              const Icon = q.icon;
              return (
                <div
                  key={q.id}
                  className={cn(
                    "rounded-lg border p-3 min-h-[140px]",
                    q.tom
                  )}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 opacity-70" />
                      <p className="text-sm font-semibold">{q.titulo}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {q.hint}
                    </span>
                  </div>
                  {itens.length === 0 ? (
                    <p className="py-2 text-xs text-muted-foreground/60">
                      Sem itens.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {itens.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-start gap-2 rounded-md bg-background/60 p-2 ring-1 ring-foreground/5"
                        >
                          <Checkbox
                            checked={a.concluida}
                            onCheckedChange={() => toggle(a)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-sm",
                                a.concluida &&
                                  "line-through text-muted-foreground"
                              )}
                            >
                              {a.titulo}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              <Badge
                                variant="outline"
                                className="h-4 px-1.5 text-[10px]"
                              >
                                {rotuloOrigem[a.origem]}
                              </Badge>
                              {a.importante && (
                                <Badge className="h-4 px-1.5 text-[10px]">
                                  Importante
                                </Badge>
                              )}
                              {a.pendingSync && (
                                <Badge
                                  variant="outline"
                                  className="h-4 gap-1 px-1.5 text-[10px]"
                                >
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  sync {a.syncOp}
                                </Badge>
                              )}
                              {a.syncError && (
                                <Badge
                                  variant="destructive"
                                  className="h-4 gap-1 px-1.5 text-[10px]"
                                >
                                  <AlertCircle className="h-2.5 w-2.5" /> erro
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Select
                              value={quadranteDe(a)}
                              onValueChange={(v) =>
                                moverQuadrante(a, v as QuadrantePM)
                              }
                            >
                              <SelectTrigger className="h-6 w-14 px-1.5 text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Q1">Q1</SelectItem>
                                <SelectItem value="Q2">Q2</SelectItem>
                                <SelectItem value="Q3">Q3</SelectItem>
                                <SelectItem value="Q4">Q4</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => excluir(a)}
                              aria-label="Excluir"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <FecharAtividadeModal
        acao={acaoParaEncerrar}
        open={!!acaoParaEncerrar}
        onOpenChange={(open) => {
          if (!open) setAcaoParaEncerrar(null);
        }}
      />
    </Card>
    </TooltipProvider>
  );
}
