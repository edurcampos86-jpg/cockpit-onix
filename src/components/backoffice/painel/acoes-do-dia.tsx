"use client";

import { CheckSquare, Plus, Trash2, AlertCircle } from "lucide-react";
import { useState, useTransition } from "react";
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
import type {
  AcaoUnificada,
  CriarAcaoInput,
  OrigemAcao,
  QuadrantePM,
} from "@/lib/painel-do-dia/types";

type DestinoSelecionado =
  | "cockpit"
  | "ms-todo"
  | "priority-matrix:Q1"
  | "priority-matrix:Q2"
  | "priority-matrix:Q3"
  | "priority-matrix:Q4";

const rotuloOrigem: Record<OrigemAcao, string> = {
  cockpit: "Cockpit",
  "ms-todo": "MS To Do",
  "priority-matrix": "Priority Matrix",
};

export function AcoesDoDia({
  acoes,
  erro,
}: {
  acoes: AcaoUnificada[];
  erro?: string;
}) {
  const router = useRouter();
  const [novoTitulo, setNovoTitulo] = useState("");
  const [destino, setDestino] = useState<DestinoSelecionado>("cockpit");
  const [isPending, start] = useTransition();

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
    await fetch(`/api/painel-do-dia/acoes/${acao.id}`, {
      method: "PATCH",
      body: JSON.stringify({ concluida: !acao.concluida }),
      headers: { "Content-Type": "application/json" },
    });
    start(() => router.refresh());
  }

  async function excluir(acao: AcaoUnificada) {
    await fetch(`/api/painel-do-dia/acoes/${acao.id}`, { method: "DELETE" });
    start(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckSquare className="h-5 w-5" /> Ações do Dia
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {erro && (
          <p className="mb-3 text-sm text-destructive">
            Falha ao carregar ações: {erro}
          </p>
        )}

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
              <SelectItem value="cockpit">Cockpit (local)</SelectItem>
              <SelectItem value="ms-todo">MS To Do</SelectItem>
              <SelectItem value="priority-matrix:Q1">Priority Matrix — Q1</SelectItem>
              <SelectItem value="priority-matrix:Q2">Priority Matrix — Q2</SelectItem>
              <SelectItem value="priority-matrix:Q3">Priority Matrix — Q3</SelectItem>
              <SelectItem value="priority-matrix:Q4">Priority Matrix — Q4</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={criar} disabled={!novoTitulo.trim() || isPending}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        {acoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma ação para hoje. Use o campo acima pra criar.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {acoes.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-md ring-1 ring-foreground/10 p-3"
              >
                <Checkbox
                  checked={a.concluida}
                  onCheckedChange={() => toggle(a)}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={
                      a.concluida
                        ? "text-sm line-through text-muted-foreground truncate"
                        : "text-sm truncate"
                    }
                  >
                    {a.titulo}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="outline">{rotuloOrigem[a.origem]}</Badge>
                    {a.quadrante && (
                      <Badge variant="secondary">{a.quadrante}</Badge>
                    )}
                    {a.importante && <Badge>Importante</Badge>}
                    {a.noMeuDia && <Badge variant="secondary">Meu Dia</Badge>}
                    {a.pendingSync && (
                      <Badge variant="outline" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        aguardando sync ({a.syncOp})
                      </Badge>
                    )}
                    {a.syncError && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" /> erro
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => excluir(a)}
                  aria-label="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
