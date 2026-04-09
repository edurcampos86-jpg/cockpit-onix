"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  RefreshCw,
  ChevronRight,
  Users,
  Bookmark,
  Share2,
  Eye,
  Heart,
  MessageCircle,
  Zap,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Clock,
} from "lucide-react";

interface MetricasPorPilar {
  pilar: string;
  posts: number;
  alcanceMedio: number;
  engajamentoMedio: number;
  salvamentosMedio: number;
  compartilhamentosMedio: number;
  viewsMedio: number;
  status: "acima_esperado" | "dentro_esperado" | "abaixo_esperado" | "ausente";
}

interface MetricasPorFormato {
  formato: string;
  posts: number;
  alcanceMedio: number;
  engajamentoMedio: number;
  salvamentosMedio: number;
  taxaSalvamento: number;
}

interface Descoberta {
  tipo: "positiva" | "negativa" | "oportunidade" | "alerta";
  titulo: string;
  descricao: string;
  dado: string;
}

interface Recomendacao {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  acao: string;
  impactoEsperado: string;
  prioridade: "alta" | "media" | "baixa";
  status: "pendente" | "implementada" | "descartada";
  ajusteRoteiro?: {
    categoria: string;
    campo: string;
    sugestao: string;
  };
}

interface AnalyticsData {
  analysisId: string;
  summary: {
    postsColetados: number;
    descobertas: number;
    recomendacoes: number;
    seguidores: number;
    variacaoSeguidores: number;
  };
  analysis: {
    snapshot: {
      totalPosts: number;
      pilares: Record<string, number>;
      formatos: Record<string, number>;
      ctas: Record<string, number>;
      melhorPost: { titulo: string; engajamento: number; pilar: string | null };
      piorPost: { titulo: string; engajamento: number; pilar: string | null };
    };
    metricasPorPilar: MetricasPorPilar[];
    metricasPorFormato: MetricasPorFormato[];
    descobertas: Descoberta[];
    recomendacoes: Recomendacao[];
    proximosTemas: string[];
  };
}

const PILAR_LABELS: Record<string, string> = {
  P1: "P1: Blindagem Patrimonial",
  P2: "P2: Casos Reais",
  P3: "P3: Cenário e Alertas",
  P4: "P4: Eduardo Pessoa",
};

const PILAR_COLORS: Record<string, string> = {
  P1: "text-blue-400",
  P2: "text-emerald-400",
  P3: "text-amber-400",
  P4: "text-purple-400",
};

const PILAR_BG: Record<string, string> = {
  P1: "bg-blue-500/10",
  P2: "bg-emerald-500/10",
  P3: "bg-amber-500/10",
  P4: "bg-purple-500/10",
};

const FORMATO_LABELS: Record<string, string> = {
  reel: "Reel",
  carrossel: "Carrossel",
  imagem: "Imagem",
  stories: "Stories",
};

const STATUS_COLORS: Record<string, string> = {
  acima_esperado: "text-emerald-400",
  dentro_esperado: "text-blue-400",
  abaixo_esperado: "text-amber-400",
  ausente: "text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  acima_esperado: "Acima do esperado",
  dentro_esperado: "Dentro do esperado",
  abaixo_esperado: "Abaixo do esperado",
  ausente: "Ausente",
};

const DESCOBERTA_ICONS: Record<string, React.ReactNode> = {
  positiva: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
  negativa: <TrendingDown className="h-5 w-5 text-red-400" />,
  oportunidade: <Lightbulb className="h-5 w-5 text-amber-400" />,
  alerta: <AlertTriangle className="h-5 w-5 text-orange-400" />,
};

const DESCOBERTA_BG: Record<string, string> = {
  positiva: "border-emerald-500/30 bg-emerald-500/5",
  negativa: "border-red-500/30 bg-red-500/5",
  oportunidade: "border-amber-500/30 bg-amber-500/5",
  alerta: "border-orange-500/30 bg-orange-500/5",
};

const PRIORIDADE_COLORS: Record<string, string> = {
  alta: "text-red-400 bg-red-500/10",
  media: "text-amber-400 bg-amber-500/10",
  baixa: "text-blue-400 bg-blue-500/10",
};

const PRIORIDADE_LABELS: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingRec, setUpdatingRec] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"descobertas" | "recomendacoes" | "pilares" | "formatos">("descobertas");

  const generateAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geradoPor: "manual" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao gerar análise");
      }
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const updateRecommendation = async (id: string, status: string) => {
    setUpdatingRec(id);
    try {
      await fetch(`/api/analytics/recommendations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      // Atualizar localmente
      if (data) {
        setData({
          ...data,
          analysis: {
            ...data.analysis,
            recomendacoes: data.analysis.recomendacoes.map((r) =>
              r.id === id ? { ...r, status: status as Recomendacao["status"] } : r
            ),
          },
        });
      }
    } finally {
      setUpdatingRec(null);
    }
  };

  const recomendacoesPendentes = data?.analysis.recomendacoes.filter(
    (r) => r.status === "pendente"
  ) || [];

  const recomendacoesAlta = recomendacoesPendentes.filter((r) => r.prioridade === "alta");

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <PageHeader
          title="Analytics & Feedback Loop"
          description="Análise de performance do Instagram com recomendações automáticas de ajuste"
        />
        <button
          onClick={generateAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analisando..." : "Gerar Análise Agora"}
        </button>
      </div>

      <div className="mb-6">
        <ComoFunciona
          proposito="Loop de feedback automático: a IA puxa as métricas reais do Instagram (alcance, engajamento, salvamentos) e gera descobertas + recomendações de ajuste nos roteiros."
          comoUsar="Clique em 'Gerar Análise Agora' uma vez por semana. Leia as Descobertas para entender o que aconteceu e implemente as Recomendações de alta prioridade primeiro."
          comoAjuda="Fecha o ciclo: você não posta no escuro. Cada semana o sistema aprende o que funcionou e ajusta os próximos roteiros automaticamente."
        />
      </div>

      {/* Estado inicial */}
      {!data && !loading && !error && (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20">
            <TrendingUp className="h-12 w-12 text-primary mx-auto" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Pronto para analisar sua performance
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Clique em &quot;Gerar Análise Agora&quot; para coletar os dados do Instagram,
              identificar padrões e receber recomendações personalizadas para ajustar seus roteiros.
            </p>
          </div>
          <button
            onClick={generateAnalysis}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            <Zap className="h-5 w-5" />
            Iniciar Análise
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <RefreshCw className="h-10 w-10 text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Coletando dados do Instagram...</p>
            <p className="text-xs text-muted-foreground mt-1">
              Buscando posts, métricas e insights da última semana
            </p>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/5 mb-6">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-400">Erro ao gerar análise</p>
            <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
          </div>
          <button
            onClick={generateAnalysis}
            className="ml-auto text-xs text-red-400 hover:text-red-300 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Dados carregados */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Seguidores</span>
                </div>
                <p className="text-2xl font-bold text-foreground">
                  {data.summary.seguidores.toLocaleString("pt-BR")}
                </p>
                <div className="flex items-center gap-1 mt-1">
                  {data.summary.variacaoSeguidores > 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                  ) : data.summary.variacaoSeguidores < 0 ? (
                    <ArrowDownRight className="h-3 w-3 text-red-400" />
                  ) : (
                    <Minus className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span
                    className={`text-xs font-medium ${
                      data.summary.variacaoSeguidores > 0
                        ? "text-emerald-400"
                        : data.summary.variacaoSeguidores < 0
                        ? "text-red-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {data.summary.variacaoSeguidores > 0 ? "+" : ""}
                    {data.summary.variacaoSeguidores} na semana
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Posts analisados</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.summary.postsColetados}</p>
                <p className="text-xs text-muted-foreground mt-1">últimos 7 dias</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="h-4 w-4 text-amber-400" />
                  <span className="text-xs text-muted-foreground">Descobertas</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{data.summary.descobertas}</p>
                <p className="text-xs text-muted-foreground mt-1">insights identificados</p>
              </CardContent>
            </Card>

            <Card className={recomendacoesAlta.length > 0 ? "border-red-500/30" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Recomendações</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{recomendacoesPendentes.length}</p>
                {recomendacoesAlta.length > 0 && (
                  <p className="text-xs text-red-400 mt-1 font-medium">
                    {recomendacoesAlta.length} de alta prioridade
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Melhor post da semana */}
          {data.analysis.snapshot.melhorPost.engajamento > 0 && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 flex items-start gap-4">
                <div className="p-3 rounded-xl bg-primary/10 shrink-0">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">Destaque da semana</p>
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {data.analysis.snapshot.melhorPost.titulo}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-xs font-bold ${PILAR_COLORS[data.analysis.snapshot.melhorPost.pilar || "P1"] || "text-primary"}`}>
                      {data.analysis.snapshot.melhorPost.pilar || "N/A"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {data.analysis.snapshot.melhorPost.engajamento.toFixed(1)}% de engajamento
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
            {(["descobertas", "recomendacoes", "pilares", "formatos"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors capitalize ${
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "descobertas" && "Descobertas"}
                {tab === "recomendacoes" && `Recomendações ${recomendacoesPendentes.length > 0 ? `(${recomendacoesPendentes.length})` : ""}`}
                {tab === "pilares" && "Por Pilar"}
                {tab === "formatos" && "Por Formato"}
              </button>
            ))}
          </div>

          {/* Tab: Descobertas */}
          {activeTab === "descobertas" && (
            <div className="space-y-3">
              {data.analysis.descobertas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma descoberta identificada para este período.
                </div>
              ) : (
                data.analysis.descobertas.map((d, i) => (
                  <div
                    key={i}
                    className={`p-4 rounded-lg border ${DESCOBERTA_BG[d.tipo]}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">{DESCOBERTA_ICONS[d.tipo]}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground mb-1">{d.titulo}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{d.descricao}</p>
                        <span className="inline-block mt-2 px-2 py-0.5 rounded-md bg-background/50 text-xs font-mono text-foreground">
                          {d.dado}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {/* Próximos temas sugeridos */}
              {data.analysis.proximosTemas.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-amber-400" />
                      <CardTitle className="text-sm">Temas sugeridos para a próxima semana</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {data.analysis.proximosTemas.map((tema, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-secondary/50">
                        <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <p className="text-xs text-foreground">{tema}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Tab: Recomendações */}
          {activeTab === "recomendacoes" && (
            <div className="space-y-4">
              {data.analysis.recomendacoes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma recomendação gerada para este período.
                </div>
              ) : (
                data.analysis.recomendacoes.map((rec, i) => (
                  <Card
                    key={i}
                    className={
                      rec.status === "implementada"
                        ? "opacity-60 border-emerald-500/20"
                        : rec.status === "descartada"
                        ? "opacity-40"
                        : rec.prioridade === "alta"
                        ? "border-red-500/30"
                        : ""
                    }
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${PRIORIDADE_COLORS[rec.prioridade]}`}
                          >
                            {PRIORIDADE_LABELS[rec.prioridade]}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] bg-secondary text-muted-foreground capitalize">
                            {rec.tipo}
                          </span>
                          {rec.status === "implementada" && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] bg-emerald-500/10 text-emerald-400">
                              Implementada
                            </span>
                          )}
                          {rec.status === "descartada" && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] bg-zinc-500/10 text-zinc-400">
                              Descartada
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-foreground mb-2">{rec.titulo}</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{rec.descricao}</p>

                      {/* Ação concreta */}
                      <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 mb-3">
                        <p className="text-[11px] font-semibold text-primary mb-1">Ação concreta:</p>
                        <p className="text-xs text-foreground leading-relaxed">{rec.acao}</p>
                      </div>

                      {/* Impacto esperado */}
                      {rec.impactoEsperado && (
                        <div className="flex items-center gap-2 mb-3">
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <p className="text-xs text-emerald-400 font-medium">{rec.impactoEsperado}</p>
                        </div>
                      )}

                      {/* Sugestão de ajuste de roteiro */}
                      {rec.ajusteRoteiro && (
                        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-3">
                          <p className="text-[11px] font-semibold text-amber-400 mb-1">
                            Sugestão de ajuste no roteiro ({rec.ajusteRoteiro.categoria}):
                          </p>
                          <p className="text-xs text-foreground italic leading-relaxed">
                            &quot;{rec.ajusteRoteiro.sugestao}&quot;
                          </p>
                        </div>
                      )}

                      {/* Botões de ação */}
                      {rec.status === "pendente" && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => updateRecommendation(rec.id, "implementada")}
                            disabled={updatingRec === rec.id}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Marcar como implementada
                          </button>
                          <button
                            onClick={() => updateRecommendation(rec.id, "descartada")}
                            disabled={updatingRec === rec.id}
                            className="px-3 py-2 rounded-lg bg-secondary text-muted-foreground text-xs font-medium hover:bg-secondary/80 transition-colors disabled:opacity-50"
                          >
                            Descartar
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {/* Tab: Por Pilar */}
          {activeTab === "pilares" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.analysis.metricasPorPilar.map((m) => (
                  <Card key={m.pilar} className={m.status === "ausente" ? "border-red-500/20 opacity-70" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${PILAR_COLORS[m.pilar]}`}>
                            {m.pilar}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {PILAR_LABELS[m.pilar]?.split(": ")[1]}
                          </span>
                        </div>
                        <span className={`text-xs font-medium ${STATUS_COLORS[m.status]}`}>
                          {STATUS_LABELS[m.status]}
                        </span>
                      </div>

                      {m.status === "ausente" ? (
                        <div className="flex items-center gap-2 py-3 text-red-400">
                          <AlertTriangle className="h-4 w-4" />
                          <p className="text-xs">Nenhum post publicado esta semana</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div className={`p-2 rounded-lg ${PILAR_BG[m.pilar]} text-center`}>
                            <p className={`text-lg font-bold ${PILAR_COLORS[m.pilar]}`}>
                              {m.engajamentoMedio.toFixed(1)}%
                            </p>
                            <p className="text-[10px] text-muted-foreground">Engajamento</p>
                          </div>
                          <div className="p-2 rounded-lg bg-secondary/50 text-center">
                            <p className="text-lg font-bold text-foreground">
                              {m.alcanceMedio.toLocaleString("pt-BR")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Alcance médio</p>
                          </div>
                          <div className="p-2 rounded-lg bg-secondary/50 text-center">
                            <p className="text-lg font-bold text-foreground">
                              {m.salvamentosMedio.toFixed(1)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Salvamentos</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs text-muted-foreground">
                          {m.posts} post{m.posts !== 1 ? "s" : ""} na semana
                        </span>
                        {m.viewsMedio > 0 && (
                          <>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {m.viewsMedio.toLocaleString("pt-BR")} views
                            </span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Tab: Por Formato */}
          {activeTab === "formatos" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {data.analysis.metricasPorFormato
                  .filter((m) => m.posts > 0)
                  .map((m) => (
                    <Card key={m.formato}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-foreground">
                            {FORMATO_LABELS[m.formato] || m.formato}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {m.posts} post{m.posts !== 1 ? "s" : ""}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Heart className="h-3.5 w-3.5" />
                              Engajamento
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {m.engajamentoMedio.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Eye className="h-3.5 w-3.5" />
                              Alcance médio
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {m.alcanceMedio.toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Bookmark className="h-3.5 w-3.5" />
                              Salvamentos
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              {m.salvamentosMedio.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Share2 className="h-3.5 w-3.5" />
                              Compartilhamentos
                            </div>
                            <span className="text-xs font-semibold text-foreground">
                              0
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>

              {/* Comparativo de formatos */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-primary" />
                    Comparativo: Carrossel vs Reel
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">Dado de referência (2026):</strong> Carrosséis geram{" "}
                    <strong className="text-amber-400">3,1x mais engajamento</strong> e{" "}
                    <strong className="text-amber-400">1,4x mais salvamentos</strong> que Reels para conteúdo técnico
                    no nicho financeiro. Para o pilar P1 (Blindagem) e P3 (Alertas), priorize carrosséis.
                    Use Reels apenas para P2 (Casos Reais) e P4 (Storytelling).
                    <br />
                    <span className="text-[10px] mt-1 block opacity-70">
                      Fonte: Marketing Agent Blog, 2026; Later/Hootsuite, 2025
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Rodapé com horário de pico */}
          <Card className="border-primary/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Horário de pico do Roberto
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Publique entre <strong className="text-primary">12:00 e 12:30</strong> para maximizar o alcance inicial.
                    O persona Roberto (médico, 38-52 anos) está mais ativo neste horário (intervalo de plantão/consultório).
                    O alcance inicial é o principal sinal que o algoritmo usa para decidir se vai distribuir o conteúdo.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
