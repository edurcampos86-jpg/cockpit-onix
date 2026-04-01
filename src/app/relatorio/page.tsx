"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CheckSquare,
  Users,
  Target,
  TrendingUp,
  Award,
} from "lucide-react";
import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";
import { TrendChart } from "@/components/relatorio/trend-chart";

interface ReportData {
  period: { start: string; end: string; weekOffset: number };
  posts: { total: number; publicado: number; agendado: number; editado: number; rascunho: number };
  postsByCategory: { category: string; count: number; published: number }[];
  cta: { explicito: number; implicito: number; identificacao: number; maxExplicitCta: number; ctaRuleOk: boolean };
  tasks: { total: number; completed: number; pending: number; inProgress: number };
  leads: {
    newLeads: number;
    hot: number;
    warm: number;
    cold: number;
    byProduct: Record<string, number>;
  };
  weekGoalMet: boolean;
}

const PRODUCT_LABELS: Record<string, string> = {
  investimentos: "Investimentos",
  seguro_vida: "Seguro de Vida",
  consorcio_saude: "Consórcio Saúde",
  imoveis: "Imóveis",
  msp: "Meu Sucesso Patrimonial",
};

export default function RelatorioPage() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/relatorio?weekOffset=${weekOffset}`);
      const data = await res.json();
      setReport(data);
    } catch (error) {
      console.error("Error fetching report:", error);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  const periodLabel = report
    ? `${formatDate(report.period.start)} — ${formatDate(report.period.end)}, ${new Date(report.period.end).getFullYear()}`
    : "";

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <PageHeader
          title="Relatório Semanal"
          description="Resumo de performance e métricas da semana"
        />
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setWeekOffset((o) => o - 1)}
          className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-foreground min-w-[250px] text-center capitalize">
          {periodLabel}
        </h2>
        <button
          onClick={() => setWeekOffset((o) => o + 1)}
          disabled={weekOffset >= 0}
          className="p-2 rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        {weekOffset !== 0 && (
          <button
            onClick={() => setWeekOffset(0)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-accent-foreground hover:bg-accent/80"
          >
            Esta semana
          </button>
        )}
      </div>

      {loading || !report ? (
        <div className="flex items-center justify-center min-h-[400px] text-muted-foreground text-sm">
          Carregando relatório...
        </div>
      ) : (
        <div className="space-y-6">
          {/* Meta semanal destaque */}
          <Card className={`border-2 ${report.weekGoalMet ? "border-emerald-500/30 bg-emerald-500/5" : "border-primary/20"}`}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className={`p-4 rounded-xl ${report.weekGoalMet ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                {report.weekGoalMet ? (
                  <Award className="h-8 w-8 text-emerald-400" />
                ) : (
                  <Target className="h-8 w-8 text-primary" />
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Meta semanal de postagem</p>
                <p className={`text-4xl font-bold ${report.weekGoalMet ? "text-emerald-400" : "text-primary"}`}>
                  {report.posts.total}/5
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {report.weekGoalMet
                    ? "Meta atingida! Parabéns!"
                    : `Faltam ${5 - report.posts.total} posts para atingir a meta`}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de Tendência */}
          <TrendChart />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Posts */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Conteúdo</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{report.posts.publicado}</p>
                    <p className="text-[11px] text-muted-foreground">Publicados</p>
                  </div>
                  <div className="bg-cyan-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-cyan-400">{report.posts.agendado}</p>
                    <p className="text-[11px] text-muted-foreground">Agendados</p>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-400">{report.posts.editado}</p>
                    <p className="text-[11px] text-muted-foreground">Em produção</p>
                  </div>
                  <div className="bg-zinc-500/10 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-zinc-400">{report.posts.rascunho}</p>
                    <p className="text-[11px] text-muted-foreground">Rascunhos</p>
                  </div>
                </div>

                {/* Quadros fixos */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Quadros Fixos</p>
                  <div className="space-y-1.5">
                    {report.postsByCategory.map((cat) => (
                      <div key={cat.category} className="flex items-center justify-between text-sm">
                        <span className="text-foreground text-xs">
                          {CATEGORY_LABELS[cat.category as PostCategory] ?? cat.category}
                        </span>
                        <span className={`text-xs font-semibold ${cat.count > 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {cat.count > 0 ? `${cat.published}/${cat.count}` : "Faltando"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTAs */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">CTAs utilizados</p>
                  <div className="flex gap-2 flex-wrap">
                    <span className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-[11px] font-medium">
                      {report.cta.explicito} Explícito
                    </span>
                    <span className="px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 text-[11px] font-medium">
                      {report.cta.implicito} Implícito
                    </span>
                    <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[11px] font-medium">
                      {report.cta.identificacao} Identif.
                    </span>
                  </div>
                  <div className={`mt-2 px-2 py-1.5 rounded-md text-[11px] font-medium ${
                    report.cta.ctaRuleOk
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}>
                    80/20: {report.cta.explicito}/{report.cta.maxExplicitCta} explícitos permitidos
                    {report.cta.ctaRuleOk ? " — OK" : " — Excedido!"}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tarefas */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Tarefas</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-5xl font-bold text-primary">
                    {report.tasks.total > 0
                      ? Math.round((report.tasks.completed / report.tasks.total) * 100)
                      : 0}
                    %
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Taxa de conclusão</p>
                </div>

                {/* Progress bar */}
                <div className="w-full h-3 bg-secondary rounded-full overflow-hidden flex">
                  {report.tasks.completed > 0 && (
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${(report.tasks.completed / report.tasks.total) * 100}%` }}
                    />
                  )}
                  {report.tasks.inProgress > 0 && (
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(report.tasks.inProgress / report.tasks.total) * 100}%` }}
                    />
                  )}
                  {report.tasks.pending > 0 && (
                    <div
                      className="h-full bg-zinc-600"
                      style={{ width: `${(report.tasks.pending / report.tasks.total) * 100}%` }}
                    />
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-400">{report.tasks.completed}</p>
                    <p className="text-[10px] text-muted-foreground">Concluídas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-400">{report.tasks.inProgress}</p>
                    <p className="text-[10px] text-muted-foreground">Em progresso</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-zinc-400">{report.tasks.pending}</p>
                    <p className="text-[10px] text-muted-foreground">Pendentes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Leads */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">Leads</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-5xl font-bold text-primary">{report.leads.newLeads}</p>
                  <p className="text-sm text-muted-foreground mt-1">Novos leads na semana</p>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-red-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-red-400">{report.leads.hot}</p>
                    <p className="text-[10px] text-muted-foreground">Quentes</p>
                  </div>
                  <div className="bg-amber-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-amber-400">{report.leads.warm}</p>
                    <p className="text-[10px] text-muted-foreground">Mornos</p>
                  </div>
                  <div className="bg-blue-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-blue-400">{report.leads.cold}</p>
                    <p className="text-[10px] text-muted-foreground">Frios</p>
                  </div>
                </div>

                {/* Por produto */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Por produto</p>
                  <div className="space-y-1.5">
                    {Object.entries(report.leads.byProduct)
                      .filter(([, count]) => count > 0)
                      .map(([product, count]) => (
                        <div key={product} className="flex items-center justify-between">
                          <span className="text-xs text-foreground">
                            {PRODUCT_LABELS[product] ?? product}
                          </span>
                          <span className="text-xs font-bold text-primary">{count}</span>
                        </div>
                      ))}
                    {Object.values(report.leads.byProduct).every((c) => c === 0) && (
                      <p className="text-xs text-muted-foreground">Nenhum lead com produto definido</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
