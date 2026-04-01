"use client";

import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, CalendarDays, Loader2, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { getThemesForPeriod, type SeasonalTheme } from "@/lib/seasonal-themes";
import Link from "next/link";

type GenerateStatus = "idle" | "generating" | "success" | "error";

interface GenerateResult {
  postsCreated: number;
  totalPlanned: number;
  period: number;
  startDate: string;
  endDate: string;
  themes: string[];
}

export default function PlanejamentoPage() {
  const [period, setPeriod] = useState<30 | 60>(30);
  const [themeOverride, setThemeOverride] = useState("");
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState("");
  const [existingCount, setExistingCount] = useState(0);

  // Calcular datas do período
  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const dow = start.getDay();
    const daysUntilMonday = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
    start.setDate(start.getDate() + daysUntilMonday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + period - 1);
    return { startDate: start, endDate: end };
  }, [period]);

  // Temas sazonais do período
  const themes = useMemo(() => getThemesForPeriod(startDate, endDate), [startDate, endDate]);

  // Verificar posts existentes no período
  useEffect(() => {
    const s = startDate.toISOString();
    const e = endDate.toISOString();
    fetch(`/api/posts?startDate=${s}&endDate=${e}`)
      .then((r) => r.json())
      .then((data) => setExistingCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setExistingCount(0));
  }, [startDate, endDate]);

  const handleGenerate = async () => {
    setStatus("generating");
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/planejamento/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          themeOverride: themeOverride.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao gerar planejamento");
      }

      const data = await res.json();
      setResult(data);
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setStatus("error");
    }
  };

  const formatDate = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Gerador de Planejamento Editorial"
        description="Gere automaticamente posts com roteiros completos usando IA"
      />

      <div className="mt-8 space-y-6">
        {/* Período */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Periodo do Planejamento</h3>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => setPeriod(30)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  period === 30
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                30 dias (~20 posts)
              </button>
              <button
                onClick={() => setPeriod(60)}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  period === 60
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                60 dias (~40 posts)
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(startDate)} a {formatDate(endDate)}
            </p>

            {existingCount > 0 && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Ja existem {existingCount} posts neste periodo. Os novos serao adicionados, nao substituidos.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Temas Sazonais */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-4">Temas Sazonais Detectados</h3>
            <div className="space-y-3">
              {themes.map((theme) => (
                <ThemePreview key={theme.month} theme={theme} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tema Override */}
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold text-foreground mb-2">Tema Personalizado (opcional)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Se quiser, adicione um tema que sera usado como guarda-chuva principal, integrando com os sazonais.
            </p>
            <input
              type="text"
              value={themeOverride}
              onChange={(e) => setThemeOverride(e.target.value)}
              placeholder="Ex: Planejamento Sucessorio para Medicos, ITCMD na Bahia..."
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
            />
          </CardContent>
        </Card>

        {/* Generate Button */}
        {status === "idle" || status === "error" ? (
          <button
            onClick={handleGenerate}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors text-base"
          >
            <Sparkles className="h-5 w-5" />
            Gerar Planejamento com IA
          </button>
        ) : status === "generating" ? (
          <div className="w-full flex flex-col items-center justify-center gap-3 px-6 py-8 bg-card border border-border rounded-xl">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm font-medium text-foreground">Gerando planejamento editorial...</p>
            <p className="text-xs text-muted-foreground text-center max-w-md">
              A IA esta criando {period === 30 ? "~20" : "~40"} posts com roteiros completos, hooks,
              CTAs e hashtags. Isso pode levar 30-60 segundos.
            </p>
          </div>
        ) : null}

        {/* Error */}
        {status === "error" && error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Success */}
        {status === "success" && result && (
          <Card className="border-2 border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-bold text-emerald-400">Planejamento Gerado!</h3>
                  <p className="text-sm text-muted-foreground">
                    {result.postsCreated} posts criados com roteiros e tarefas
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{result.postsCreated}</p>
                  <p className="text-[10px] text-muted-foreground">Posts criados</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{result.postsCreated * 4}</p>
                  <p className="text-[10px] text-muted-foreground">Tarefas geradas</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{result.postsCreated}</p>
                  <p className="text-[10px] text-muted-foreground">Roteiros prontos</p>
                </div>
              </div>

              {result.themes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {result.themes.map((t, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              <Link
                href="/calendario"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm"
              >
                <CalendarDays className="h-4 w-4" />
                Ver no Calendario
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: SeasonalTheme }) {
  const monthNames = [
    "", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-foreground">{monthNames[theme.month]}</h4>
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {theme.theme}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {theme.topics.slice(0, 4).map((topic, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
            {topic}
          </span>
        ))}
        {theme.topics.length > 4 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
            +{theme.topics.length - 4}
          </span>
        )}
      </div>
    </div>
  );
}
