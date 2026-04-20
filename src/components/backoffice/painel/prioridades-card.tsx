"use client";

import { Target } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { Prioridade } from "@/lib/painel-do-dia/types";

export function PrioridadesCard({
  prioridades,
  data,
}: {
  prioridades: Prioridade[];
  data: string;
}) {
  const router = useRouter();
  const slots: (1 | 2 | 3)[] = [1, 2, 3];
  const porPosicao = new Map(prioridades.map((p) => [p.posicao, p]));
  const [textos, setTextos] = useState<Record<number, string>>(() =>
    slots.reduce(
      (acc, pos) => ({ ...acc, [pos]: porPosicao.get(pos)?.texto ?? "" }),
      {}
    )
  );

  async function salvar(posicao: 1 | 2 | 3) {
    const texto = textos[posicao]?.trim();
    if (!texto) return;
    await fetch("/api/painel-do-dia/prioridades", {
      method: "POST",
      body: JSON.stringify({ data, posicao, texto }),
      headers: { "Content-Type": "application/json" },
    });
    router.refresh();
  }

  async function alternar(posicao: 1 | 2 | 3) {
    const existente = porPosicao.get(posicao);
    if (!existente) return;
    await fetch(`/api/painel-do-dia/prioridades/${existente.id}`, {
      method: "PATCH",
      body: JSON.stringify({ concluida: !existente.concluida }),
      headers: { "Content-Type": "application/json" },
    });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" /> 3 Prioridades do Dia
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {slots.map((posicao) => {
          const p = porPosicao.get(posicao);
          return (
            <div key={posicao} className="flex items-center gap-3 px-4">
              <span className="w-5 text-center text-sm font-semibold text-muted-foreground">
                {posicao}
              </span>
              <Checkbox
                checked={p?.concluida ?? false}
                disabled={!p}
                onCheckedChange={() => alternar(posicao)}
              />
              <Input
                className={
                  p?.concluida
                    ? "line-through text-muted-foreground"
                    : undefined
                }
                placeholder={`Prioridade ${posicao}...`}
                value={textos[posicao] ?? ""}
                onChange={(e) =>
                  setTextos((t) => ({ ...t, [posicao]: e.target.value }))
                }
                onBlur={() => salvar(posicao)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
