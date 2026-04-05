"use client";

import { useState } from "react";
import { Users, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface Periodo {
  periodo: string;
  periodoInicio: string;
  periodoFim: string;
  vendedores: string[];
}

export function GerarColetivoButton({ periodos }: { periodos: Periodo[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPeriodo, setSelectedPeriodo] = useState(0);
  const router = useRouter();

  if (periodos.length === 0) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4 text-center">
        Nenhum periodo com relatorios de Thiago e Rose encontrado. Gere os relatorios individuais primeiro.
      </div>
    );
  }

  const periodo = periodos[selectedPeriodo];

  async function handleGerar() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/onix-corretora/coletivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo: periodo.periodo,
          periodoInicio: periodo.periodoInicio,
          periodoFim: periodo.periodoFim,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error || "Erro ao gerar relatorio coletivo");
        return;
      }

      router.refresh();
    } catch (err: any) {
      setError(err.message || "Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-medium text-foreground">Gerar Relatorio Coletivo</h3>
          <p className="text-xs text-muted-foreground">
            Cruza os relatorios de Thiago e Rose para a reuniao de terca
          </p>
        </div>
      </div>

      {periodos.length > 1 && (
        <div className="mb-4">
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Periodo</label>
          <select
            value={selectedPeriodo}
            onChange={(e) => setSelectedPeriodo(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            disabled={loading}
          >
            {periodos.map((p, i) => (
              <option key={i} value={i}>
                {p.periodo} ({p.vendedores.length} assessor{p.vendedores.length > 1 ? "es" : ""}: {p.vendedores.map(v => v.split(" ")[0]).join(", ")})
              </option>
            ))}
          </select>
        </div>
      )}

      {periodos.length === 1 && (
        <div className="mb-4 text-sm text-muted-foreground">
          Periodo: <span className="font-medium text-foreground">{periodo.periodo}</span>
          {" "}({periodo.vendedores.map(v => v.split(" ")[0]).join(" e ")})
        </div>
      )}

      {error && (
        <div className="mb-4 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handleGerar}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Gerando analise coletiva...
          </>
        ) : (
          <>
            <Users className="h-4 w-4" />
            Gerar Padroes Coletivos
          </>
        )}
      </button>
    </div>
  );
}
