"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  TrendingDown,
  Bookmark,
  Share2,
  Heart,
  MessageCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  Users,
  Target,
  BarChart3,
  Link2,
  Download,
  Calendar,
  DollarSign,
  Ratio,
  Megaphone,
  Layers,
  Save,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface KpiDefinition {
  id: string;
  name: string;
  description: string;
  meta: string;
  metaValue?: number;
  icon: React.ElementType;
  suffix?: string;
  prefix?: string;
  isPercentage?: boolean;
}

interface CamadaDefinition {
  id: string;
  title: string;
  color: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
  kpis: KpiDefinition[];
}

interface WeekData {
  weekLabel: string;
  timestamp: string;
  values: Record<string, number | string>;
}

// ── Essential KPIs (top 5) ─────────────────────────────────────────────────────

const ESSENTIAL_KPIS: KpiDefinition[] = [
  { id: "crescimento_seguidores", name: "Crescimento de seguidores", description: "Novos seguidores na semana", meta: "+25/semana", metaValue: 25, icon: TrendingUp },
  { id: "salvamentos_post", name: "Salvamentos por post", description: "Quantas pessoas salvaram", meta: "5+", metaValue: 5, icon: Bookmark },
  { id: "compartilhamentos_post", name: "Compartilhamentos por post", description: "Quantas vezes foi enviado", meta: "3+", metaValue: 3, icon: Share2 },
  { id: "taxa_engajamento", name: "Taxa de engajamento", description: "(Curtidas+Comentários+Shares+Saves)/Alcance x100", meta: ">5%", metaValue: 5, icon: Heart, suffix: "%", isPercentage: true },
  { id: "dms_qualificados", name: "DMs qualificados", description: "Mensagens com intenção de consultoria", meta: "20+/mês", metaValue: 20, icon: MessageCircle },
];

// ── Camadas ────────────────────────────────────────────────────────────────────

const CAMADAS: CamadaDefinition[] = [
  {
    id: "alcance",
    title: "Camada 1: KPIs de Alcance (Topo de Funil)",
    color: "blue",
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-500/10",
    textColor: "text-blue-400",
    kpis: [
      { id: "alcance_semanal", name: "Alcance semanal", description: "Contas unicas que viram seu conteudo", meta: "2.000+", metaValue: 2000, icon: Eye },
      { id: "visualizacoes_totais", name: "Visualizacoes totais", description: "Total de vezes que o conteudo foi exibido", meta: "5.000+", metaValue: 5000, icon: Eye },
      { id: "crescimento_seguidores_c1", name: "Crescimento de seguidores", description: "Novos seguidores por semana/mes", meta: "+25/semana (+100/mes)", metaValue: 25, icon: TrendingUp },
      { id: "taxa_alcance_nao_seguidor", name: "Taxa de alcance nao-seguidor", description: "% do alcance vindo de quem nao te segue", meta: ">30%", metaValue: 30, icon: Users, suffix: "%", isPercentage: true },
    ],
  },
  {
    id: "engajamento",
    title: "Camada 2: KPIs de Engajamento (Meio de Funil)",
    color: "amber",
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-400",
    kpis: [
      { id: "taxa_engajamento_c2", name: "Taxa de engajamento", description: "(Curtidas+Comentarios+Shares+Saves)/Alcance x100", meta: ">5%", metaValue: 5, icon: Heart, suffix: "%", isPercentage: true },
      { id: "salvamentos_post_c2", name: "Salvamentos por post", description: "Quantas pessoas salvaram o conteudo", meta: "5+ por post", metaValue: 5, icon: Bookmark },
      { id: "compartilhamentos_post_c2", name: "Compartilhamentos por post", description: "Quantas vezes o post foi enviado para outros", meta: "3+ por post", metaValue: 3, icon: Share2 },
      { id: "comentarios_post", name: "Comentarios por post", description: "Interacoes em texto", meta: "5+ por post", metaValue: 5, icon: MessageCircle },
      { id: "retencao_reels", name: "Retencao de Reels", description: "% do video que as pessoas assistem", meta: ">40% (meta: >50%)", metaValue: 40, icon: BarChart3, suffix: "%", isPercentage: true },
    ],
  },
  {
    id: "conversao",
    title: "Camada 3: KPIs de Conversao (Fundo de Funil)",
    color: "emerald",
    borderColor: "border-l-emerald-500",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-400",
    kpis: [
      { id: "dms_qualificados_c3", name: "DMs qualificados/mes", description: "Mensagens no Direct com intencao de consultoria", meta: "20+", metaValue: 20, icon: MessageCircle },
      { id: "cliques_link_bio", name: "Cliques no link da bio", description: "Quantas pessoas acessaram bio.onixcapital.com.br", meta: "A metrificar", icon: Link2 },
      { id: "downloads_ebook", name: "Downloads do e-book/mes", description: "Captacao de leads via isca digital", meta: "30+", metaValue: 30, icon: Download },
      { id: "reunioes_agendadas", name: "Reunioes agendadas/mes", description: "Conversoes em reuniao via Instagram", meta: "KPI mais proximo da receita", icon: Calendar },
      { id: "receita_instagram", name: "Receita atribuida ao Instagram", description: "Faturamento de clientes captados via IG", meta: "R$5k+", metaValue: 5000, icon: DollarSign, prefix: "R$" },
    ],
  },
  {
    id: "saude",
    title: "Camada 4: KPIs de Saude do Perfil (Estrutural)",
    color: "purple",
    borderColor: "border-l-purple-500",
    bgColor: "bg-purple-500/10",
    textColor: "text-purple-400",
    kpis: [
      { id: "ratio_seguindo_seguidores", name: "Ratio seguindo/seguidores", description: "Proporcao entre quem voce segue e quem te segue", meta: "<0,3 (hoje: 0,74)", metaValue: 0.3, icon: Ratio },
      { id: "frequencia_publicacao", name: "Frequencia de publicacao", description: "Posts por semana", meta: "5 (conforme calendario v4)", metaValue: 5, icon: Calendar },
      { id: "distribuicao_pilar", name: "Distribuicao por pilar", description: "% de posts em cada pilar", meta: "P1:40% P2:20% P3:20% P4:20%", icon: Layers },
      { id: "uso_cta_algoritmo", name: "Uso de CTA de Algoritmo", description: "% de posts P1/P3 com Salva ou Compartilha", meta: "100% dos P1 e P3", metaValue: 100, icon: Megaphone, suffix: "%", isPercentage: true },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "cockpit-onix-kpis";

function getCurrentWeekLabel(): string {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / 86400000);
  const weekNum = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-S${String(weekNum).padStart(2, "0")}`;
}

function getWeekDisplayLabel(weekLabel: string): string {
  const [year, weekPart] = weekLabel.split("-S");
  return `Semana ${parseInt(weekPart)} de ${year}`;
}

function loadAllWeeks(): WeekData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAllWeeks(weeks: WeekData[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(weeks));
}

function getAllKpiIds(): string[] {
  const ids = ESSENTIAL_KPIS.map((k) => k.id);
  for (const camada of CAMADAS) {
    for (const kpi of camada.kpis) {
      if (!ids.includes(kpi.id)) ids.push(kpi.id);
    }
  }
  return ids;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function KpisPage() {
  const [allWeeks, setAllWeeks] = useState<WeekData[]>([]);
  const [selectedWeek, setSelectedWeek] = useState<string>(getCurrentWeekLabel());
  const [values, setValues] = useState<Record<string, number | string>>({});
  const [expandedCamadas, setExpandedCamadas] = useState<Record<string, boolean>>({
    alcance: false,
    engajamento: false,
    conversao: false,
    saude: false,
  });
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    const weeks = loadAllWeeks();
    setAllWeeks(weeks);
    const current = weeks.find((w) => w.weekLabel === selectedWeek);
    if (current) {
      setValues(current.values);
    } else {
      setValues({});
    }
  }, []);

  // When selected week changes, load that week's data
  const handleWeekChange = useCallback(
    (weekLabel: string) => {
      setSelectedWeek(weekLabel);
      const week = allWeeks.find((w) => w.weekLabel === weekLabel);
      setValues(week ? week.values : {});
    },
    [allWeeks]
  );

  const handleValueChange = useCallback((kpiId: string, value: string) => {
    setValues((prev) => ({
      ...prev,
      [kpiId]: value === "" ? "" : isNaN(Number(value)) ? value : Number(value),
    }));
  }, []);

  const handleSave = useCallback(() => {
    const weekData: WeekData = {
      weekLabel: selectedWeek,
      timestamp: new Date().toISOString(),
      values: { ...values },
    };
    const updated = allWeeks.filter((w) => w.weekLabel !== selectedWeek);
    updated.push(weekData);
    updated.sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
    setAllWeeks(updated);
    saveAllWeeks(updated);
    setSaveMessage("Dados salvos com sucesso!");
    setTimeout(() => setSaveMessage(null), 3000);
  }, [selectedWeek, values, allWeeks]);

  const toggleCamada = useCallback((id: string) => {
    setExpandedCamadas((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Get previous week's values for comparison
  const getPreviousWeekValues = useCallback((): Record<string, number | string> => {
    const sortedWeeks = [...allWeeks].sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
    const currentIdx = sortedWeeks.findIndex((w) => w.weekLabel === selectedWeek);
    if (currentIdx > 0) {
      return sortedWeeks[currentIdx - 1].values;
    }
    return {};
  }, [allWeeks, selectedWeek]);

  const previousValues = getPreviousWeekValues();

  // Get all week labels for dropdown
  const weekOptions = allWeeks
    .map((w) => w.weekLabel)
    .sort()
    .reverse();
  if (!weekOptions.includes(getCurrentWeekLabel())) {
    weekOptions.unshift(getCurrentWeekLabel());
  }
  if (!weekOptions.includes(selectedWeek)) {
    weekOptions.unshift(selectedWeek);
  }
  const uniqueWeekOptions = [...new Set(weekOptions)].sort().reverse();

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderTrendArrow(kpiId: string) {
    const current = Number(values[kpiId]);
    const previous = Number(previousValues[kpiId]);
    if (isNaN(current) || isNaN(previous) || !previous) return null;
    const diff = current - previous;
    if (diff > 0) return <TrendingUp className="h-4 w-4 text-emerald-400" />;
    if (diff < 0) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <span className="text-xs text-muted-foreground">=</span>;
  }

  function renderProgress(kpiId: string, metaValue?: number) {
    if (!metaValue) return null;
    const current = Number(values[kpiId]);
    if (isNaN(current)) return null;
    // For ratio_seguindo_seguidores, lower is better
    const isLowerBetter = kpiId === "ratio_seguindo_seguidores";
    let pct: number;
    if (isLowerBetter) {
      pct = current <= metaValue ? 100 : Math.max(0, Math.round(((metaValue * 2 - current) / metaValue) * 100));
    } else {
      pct = Math.min(100, Math.round((current / metaValue) * 100));
    }
    const color = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground">{pct}%</span>
      </div>
    );
  }

  function renderEssentialCard(kpi: KpiDefinition) {
    const Icon = kpi.icon;
    return (
      <Card key={kpi.id} className="flex-1 min-w-[180px]">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            {renderTrendArrow(kpi.id)}
          </div>
          <p className="text-xs font-medium text-foreground leading-tight">{kpi.name}</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="any"
              value={values[kpi.id] ?? ""}
              onChange={(e) => handleValueChange(kpi.id, e.target.value)}
              placeholder="—"
              className="w-20 h-8 px-2 text-lg font-bold text-foreground bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            {kpi.suffix && <span className="text-xs text-muted-foreground">{kpi.suffix}</span>}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">Meta: {kpi.meta}</p>
            {getStatusBadge(getKpiStatus(kpi.id, kpi.metaValue))}
          </div>
          {renderProgress(kpi.id, kpi.metaValue)}
        </CardContent>
      </Card>
    );
  }

  function renderCamadaTable(camada: CamadaDefinition) {
    const isExpanded = expandedCamadas[camada.id];
    return (
      <div key={camada.id} className="rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => toggleCamada(camada.id)}
          className={`w-full flex items-center gap-3 px-4 py-3 border-l-4 ${camada.borderColor} bg-card hover:bg-accent/50 transition-colors`}
        >
          {isExpanded ? (
            <ChevronDown className={`h-4 w-4 ${camada.textColor}`} />
          ) : (
            <ChevronRight className={`h-4 w-4 ${camada.textColor}`} />
          )}
          <span className={`text-sm font-semibold ${camada.textColor}`}>{camada.title}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {camada.kpis.filter((k) => values[k.id] !== undefined && values[k.id] !== "").length}/{camada.kpis.length} preenchidos
          </span>
        </button>
        {isExpanded && (
          <div className="bg-card/50">
            <div className="grid grid-cols-[1fr_1.5fr_auto_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-border text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">
              <span>KPI</span>
              <span>O que mede</span>
              <span>Meta Fase 1</span>
              <span className="text-center">Valor</span>
              <span className="text-center">Status</span>
              <span className="text-center">Trend</span>
            </div>
            {camada.kpis.map((kpi) => {
              const Icon = kpi.icon;
              return (
                <div
                  key={kpi.id}
                  className="grid grid-cols-[1fr_1.5fr_auto_auto_auto_auto] gap-x-4 items-center px-4 py-2.5 border-b border-border/50 last:border-b-0 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-3.5 w-3.5 ${camada.textColor} shrink-0`} />
                    <span className="text-xs text-foreground">{kpi.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">{kpi.description}</span>
                  <span className={`text-[11px] font-medium ${camada.textColor} min-w-[120px]`}>{kpi.meta}</span>
                  <div className="flex items-center gap-1 min-w-[100px] justify-center">
                    {kpi.prefix && <span className="text-xs text-muted-foreground">{kpi.prefix}</span>}
                    <input
                      type="number"
                      step="any"
                      value={values[kpi.id] ?? ""}
                      onChange={(e) => handleValueChange(kpi.id, e.target.value)}
                      placeholder="—"
                      className="w-20 h-7 px-2 text-xs font-medium text-foreground bg-secondary/50 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    {kpi.suffix && <span className="text-xs text-muted-foreground">{kpi.suffix}</span>}
                  </div>
                  <div className="flex justify-center min-w-[80px]">{getStatusBadge(getKpiStatus(kpi.id, kpi.metaValue))}</div>
                  <div className="flex justify-center min-w-[40px]">{renderTrendArrow(kpi.id)}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Score helpers ──────────────────────────────────────────────────────────

  function getKpiStatus(kpiId: string, metaValue?: number): "atingido" | "proximo" | "abaixo" | "vazio" {
    if (!metaValue) return "vazio";
    const current = Number(values[kpiId]);
    if (isNaN(current) || values[kpiId] === "" || values[kpiId] === undefined) return "vazio";
    const isLowerBetter = kpiId === "ratio_seguindo_seguidores";
    if (isLowerBetter) {
      if (current <= metaValue) return "atingido";
      if (current <= metaValue * 1.5) return "proximo";
      return "abaixo";
    }
    const pct = (current / metaValue) * 100;
    if (pct >= 100) return "atingido";
    if (pct >= 60) return "proximo";
    return "abaixo";
  }

  function getStatusBadge(status: "atingido" | "proximo" | "abaixo" | "vazio") {
    switch (status) {
      case "atingido": return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Meta atingida</span>;
      case "proximo": return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Quase lá</span>;
      case "abaixo": return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">Abaixo da meta</span>;
      default: return null;
    }
  }

  // Count overall progress
  const allTrackableKpis = [...ESSENTIAL_KPIS, ...CAMADAS.flatMap(c => c.kpis)].filter(k => k.metaValue);
  const uniqueTrackable = allTrackableKpis.filter((k, i, arr) => arr.findIndex(x => x.id === k.id) === i);
  const filledKpis = uniqueTrackable.filter(k => values[k.id] !== undefined && values[k.id] !== "");
  const atingidos = uniqueTrackable.filter(k => getKpiStatus(k.id, k.metaValue) === "atingido");
  const proximos = uniqueTrackable.filter(k => getKpiStatus(k.id, k.metaValue) === "proximo");
  const abaixo = uniqueTrackable.filter(k => getKpiStatus(k.id, k.metaValue) === "abaixo");

  // ── Historical data for tracking ─────────────────────────────────────────

  const sortedHistory = [...allWeeks].sort((a, b) => b.weekLabel.localeCompare(a.weekLabel)).slice(0, 8);

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        title="KPIs do Instagram"
        description="Painel de indicadores de performance — @eduardorcampos"
      >
        <div className="flex items-center gap-3">
          <select
            value={selectedWeek}
            onChange={(e) => handleWeekChange(e.target.value)}
            className="h-9 px-3 text-sm bg-secondary border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {uniqueWeekOptions.map((wl) => (
              <option key={wl} value={wl}>
                {getWeekDisplayLabel(wl)}
              </option>
            ))}
          </select>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Save className="h-4 w-4" />
            Salvar Semana
          </button>
        </div>
      </PageHeader>

      <div className="p-6 md:p-8 space-y-6">
        {/* Save confirmation */}
        {saveMessage && (
          <div className="px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-medium">
            {saveMessage}
          </div>
        )}

        {/* ── Resumo Semanal ───────────────────────────────────────────── */}
        <Card className="border-primary/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Resumo — {getWeekDisplayLabel(selectedWeek)}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Progresso em relação às metas da Fase 1</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-primary">{filledKpis.length}<span className="text-sm text-muted-foreground font-normal">/{uniqueTrackable.length} preenchidos</span></p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Target className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-emerald-400">{atingidos.length}</p>
                  <p className="text-[10px] text-emerald-400/70">Metas atingidas</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
                <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-400">{proximos.length}</p>
                  <p className="text-[10px] text-amber-400/70">Quase lá (60%+)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/15">
                <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
                  <TrendingDown className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-lg font-bold text-red-400">{abaixo.length}</p>
                  <p className="text-[10px] text-red-400/70">Abaixo da meta</p>
                </div>
              </div>
            </div>
            {/* Barra de progresso geral */}
            {filledKpis.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Progresso geral</span>
                  <span>{atingidos.length} de {filledKpis.length} metas batidas ({filledKpis.length > 0 ? Math.round((atingidos.length / filledKpis.length) * 100) : 0}%)</span>
                </div>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden flex">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${filledKpis.length > 0 ? (atingidos.length / filledKpis.length) * 100 : 0}%` }} />
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${filledKpis.length > 0 ? (proximos.length / filledKpis.length) * 100 : 0}%` }} />
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${filledKpis.length > 0 ? (abaixo.length / filledKpis.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Painel Essencial ──────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Painel Essencial</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Os 5 indicadores prioritários que resumem sua performance no Instagram
          </p>
          <div className="flex flex-wrap gap-4">
            {ESSENTIAL_KPIS.map((kpi) => renderEssentialCard(kpi))}
          </div>
        </div>

        {/* ── Camadas ───────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-3">Indicadores por Camada</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Clique em cada camada para expandir e preencher os indicadores detalhados
          </p>
          <div className="space-y-3">
            {CAMADAS.map((camada) => renderCamadaTable(camada))}
          </div>
        </div>

        {/* ── Histórico de Acompanhamento ──────────────────────────────── */}
        {sortedHistory.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3">Histórico Semanal</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Evolução dos 5 KPIs essenciais nas últimas semanas
            </p>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-[10px] uppercase font-semibold text-muted-foreground">Semana</th>
                      {ESSENTIAL_KPIS.map(kpi => (
                        <th key={kpi.id} className="text-center px-3 py-3 text-[10px] uppercase font-semibold text-muted-foreground">
                          {kpi.name.split(" ").slice(0, 2).join(" ")}
                          <div className="text-[9px] font-normal text-primary/60 mt-0.5">Meta: {kpi.meta}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHistory.map((week) => (
                      <tr key={week.weekLabel} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-medium text-foreground whitespace-nowrap">
                          {getWeekDisplayLabel(week.weekLabel)}
                        </td>
                        {ESSENTIAL_KPIS.map(kpi => {
                          const val = week.values[kpi.id];
                          const numVal = Number(val);
                          const hasVal = val !== undefined && val !== "" && !isNaN(numVal);
                          let cellColor = "text-muted-foreground";
                          if (hasVal && kpi.metaValue) {
                            const pct = (numVal / kpi.metaValue) * 100;
                            if (pct >= 100) cellColor = "text-emerald-400 font-semibold";
                            else if (pct >= 60) cellColor = "text-amber-400";
                            else cellColor = "text-red-400";
                          }
                          return (
                            <td key={kpi.id} className={`text-center px-3 py-2.5 text-xs ${cellColor}`}>
                              {hasVal ? `${kpi.prefix || ""}${numVal}${kpi.suffix || ""}` : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
