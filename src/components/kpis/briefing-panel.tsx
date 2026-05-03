"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, TrendingUp, TrendingDown, ListChecks, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface BriefingItem {
  area: string;
  detalhe: string;
}

interface AcaoItem {
  prioridade: number;
  acao: string;
  responsavelSugerido: string;
  ate: string;
}

interface BriefingResponse {
  geradoEm: string;
  janela: { inicio: string; fim: string };
  briefing: {
    resumo: string;
    melhorou: BriefingItem[];
    piorou: BriefingItem[];
    acoes: AcaoItem[];
  };
}

function fmtDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function BriefingPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function gerar() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/kpis/briefing", { method: "POST" });
      if (!res.ok) {
        const txt = await res.text();
        setError(`Erro ${res.status}: ${txt.slice(0, 200)}`);
        return;
      }
      const json: BriefingResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Briefing semanal · IA</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data
                  ? `Gerado em ${fmtDate(data.geradoEm)} · Janela ${fmtDate(data.janela.inicio)} a ${fmtDate(data.janela.fim)}`
                  : "Le posts, leads, relatorios PAT e tarefas dos ultimos 7 dias e gera um diagnostico"}
              </p>
            </div>
          </div>
          <button
            onClick={gerar}
            disabled={loading}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Gerando..." : data ? "Atualizar" : "Gerar briefing"}
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {data && (
          <div className="space-y-4 pt-2">
            <div className="px-4 py-3 rounded-lg bg-secondary/40 border border-border">
              <p className="text-sm text-foreground leading-relaxed">{data.briefing.resumo}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-emerald-400">O que melhorou</h3>
                </div>
                {data.briefing.melhorou.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada a destacar.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.briefing.melhorou.map((item, idx) => (
                      <li key={idx} className="text-xs text-foreground leading-relaxed">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold mr-1.5">
                          {item.area}
                        </span>
                        {item.detalhe}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <h3 className="text-sm font-semibold text-red-400">O que piorou ou estagnou</h3>
                </div>
                {data.briefing.piorou.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nada a corrigir.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.briefing.piorou.map((item, idx) => (
                      <li key={idx} className="text-xs text-foreground leading-relaxed">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[10px] font-semibold mr-1.5">
                          {item.area}
                        </span>
                        {item.detalhe}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">
                  Acoes para a proxima semana
                </h3>
              </div>
              {data.briefing.acoes.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma acao prioritaria.</p>
              ) : (
                <ol className="space-y-2.5">
                  {data.briefing.acoes
                    .sort((a, b) => a.prioridade - b.prioridade)
                    .map((item) => (
                      <li key={item.prioridade} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0">
                          {item.prioridade}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground leading-relaxed">{item.acao}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            <span className="font-semibold">{item.responsavelSugerido}</span> · {item.ate}
                          </p>
                        </div>
                      </li>
                    ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
