"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClienteEsquecido } from "@/lib/painel-do-dia/clientes-esquecidos";

/**
 * Card no Painel do Dia listando clientes que passaram da cadencia esperada.
 * Server-side calcula a lista; aqui so renderiza + botoes.
 *
 * Botoes por card:
 *  - "Marcar contato" → POST .../marcar-contato → atualiza ultimoContatoAt
 *  - "Ver perfil" → /backoffice/clientes/[id] (link nativo)
 *
 * Marcar reuniao e Responder com Claude (sem e-mail base) ficam pra
 * proximo ciclo — exigem UI extra (date picker, compose new).
 */

function classeBadgeClass(c: string): string {
  if (c === "A") return "bg-red-500/15 text-red-400 border-red-500/30";
  if (c === "B") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function descricaoDias(diasSemContato: number | null): string {
  if (diasSemContato === null) return "Nunca contatado";
  if (diasSemContato === 1) return "1 dia sem contato";
  return `${diasSemContato} dias sem contato`;
}

export function ClientesEsquecidosBlock({
  clientes,
}: {
  clientes: ClienteEsquecido[];
}) {
  const router = useRouter();
  const [processando, setProcessando] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  if (clientes.length === 0) return null;

  const marcarContato = async (id: string) => {
    setProcessando(id);
    setErros((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });
    try {
      const res = await fetch(
        `/api/painel-do-dia/clientes-esquecidos/${id}/marcar-contato`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setErros((e) => ({ ...e, [id]: data.error ?? "Erro" }));
        return;
      }
      router.refresh();
    } catch {
      setErros((e) => ({ ...e, [id]: "Erro de rede" }));
    } finally {
      setProcessando(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          Clientes esquecidos
          <Badge variant="secondary" className="ml-2">
            {clientes.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Passaram da cadência esperada (A: 30d, B: 90d, C: 180d). Marque
          contato quando ligar/escrever, ou abra o perfil pra mais contexto.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {clientes.map((c) => {
          const erroDoCard = erros[c.id];
          const proximaReuniao = c.proximaReuniaoAt
            ? new Date(c.proximaReuniaoAt)
            : null;
          const reuniaoFutura =
            proximaReuniao && proximaReuniao.getTime() > Date.now();
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classeBadgeClass(
                      c.classificacao,
                    )}`}
                  >
                    {c.classificacao}
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">
                    {c.nome}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {descricaoDias(c.diasSemContato)}
                  {reuniaoFutura && (
                    <span className="ml-2 text-emerald-400">
                      · reunião marcada
                    </span>
                  )}
                </p>
                {erroDoCard && (
                  <p className="mt-1 text-[11px] text-red-400">{erroDoCard}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void marcarContato(c.id)}
                  disabled={processando === c.id}
                  className="gap-1.5"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {processando === c.id ? "Marcando..." : "Marcar contato"}
                </Button>
                <Link
                  href={`/backoffice/clientes/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Ver perfil <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
