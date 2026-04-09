"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ComoFunciona } from "@/components/layout/como-funciona";
import {
  AlertTriangle,
  Clock,
  DollarSign,
  RefreshCw,
  CheckCircle2,
  Copy,
  ChevronDown,
  ChevronUp,
  Moon,
  Send,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Prioridade = "alta" | "media" | "baixa";

type AlertaParado = {
  id: string;
  tipo: "parado_48h" | "alto_ticket";
  prioridade: Prioridade;
  nomeCliente: string;
  valor: number;
  responsavel: string;
  etapa: string;
  ultimaAtividade: string;
  diasParado: number;
  horasParado: number;
  ultimaResolucao: { acaoTomada: string; resolvidoEm: string } | null;
};

type AlertaAdormecido = {
  id: string;
  tipo: "reativacao_60d";
  prioridade: Prioridade;
  nomeCliente: string;
  valor: number;
  responsavel: string;
  motivoPerda: string | null;
  dataPerda: string | null;
  dataRecontato: string | null;
  diasAteRecontato: number | null;
  recontatoVencido: boolean;
  ultimaResolucao: { acaoTomada: string; resolvidoEm: string } | null;
};

type Contadores = {
  totalParados: number;
  totalAlta: number;
  totalMedia: number;
  totalBaixa: number;
  totalAdormecidos: number;
  totalRecontatoVencido: number;
};

type Props = {
  alertasParados: AlertaParado[];
  alertasAdormecidos: AlertaAdormecido[];
  contadores: Contadores;
  templatesReativacao: Record<string, string>;
};

type TabAtiva = "parados" | "adormecidos";
type FiltroPrioridade = "todos" | Prioridade;

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const PRIORIDADE_CONFIG: Record<Prioridade, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  alta: { label: "Alta", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", emoji: "🔴" },
  media: { label: "Media", color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", emoji: "🟡" },
  baixa: { label: "Baixa", color: "text-green-600", bg: "bg-green-50", border: "border-green-200", emoji: "🟢" },
};

const MOTIVO_LABELS: Record<string, string> = {
  preco: "Preco",
  timing: "Timing",
  concorrencia: "Concorrencia",
  atendimento: "Atendimento",
  outro: "Outro",
};

// ── Counter Card ─────────────────────────────────────────────────────────────

function CounterCard({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Resolver Modal ───────────────────────────────────────────────────────────

function ResolverForm({
  negocioId,
  tipo,
  onClose,
  onResolved,
}: {
  negocioId: string;
  tipo: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [acao, setAcao] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!acao.trim()) return;
    setSaving(true);
    try {
      await fetch("/api/onix-corretora/alertas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ negocioId, tipo, acaoTomada: acao }),
      });
      onResolved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 p-4 rounded-lg border border-primary/20 bg-primary/5 space-y-3">
      <p className="text-xs font-semibold text-foreground">Registrar acao tomada</p>
      <textarea
        value={acao}
        onChange={(e) => setAcao(e.target.value)}
        placeholder="Ex: Liguei para o cliente, agendei reuniao para quinta..."
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !acao.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Resolver"}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-sidebar-accent text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Adormecer Modal ──────────────────────────────────────────────────────────

function AdormecerForm({
  negocioId,
  onClose,
  onDone,
}: {
  negocioId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!motivo) return;
    setSaving(true);
    try {
      await fetch("/api/onix-corretora/alertas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: negocioId, motivoPerda: motivo }),
      });
      onDone();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 p-4 rounded-lg border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30 space-y-3">
      <p className="text-xs font-semibold text-foreground">Marcar como Negocio Adormecido</p>
      <p className="text-xs text-muted-foreground">O sistema agenda recontato automatico em 60 dias.</p>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Motivo da perda</label>
        <select
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Selecione...</option>
          <option value="preco">Preco</option>
          <option value="timing">Timing</option>
          <option value="concorrencia">Concorrencia</option>
          <option value="atendimento">Atendimento</option>
          <option value="outro">Outro</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !motivo}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 transition-colors disabled:opacity-50"
        >
          <Moon className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Adormecer"}
        </button>
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg bg-sidebar-accent text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Card: Alerta Parado ──────────────────────────────────────────────────────

function AlertaParadoCard({ alerta }: { alerta: AlertaParado }) {
  const [showResolver, setShowResolver] = useState(false);
  const [showAdormecer, setShowAdormecer] = useState(false);
  const [resolved, setResolved] = useState(false);
  const router = useRouter();
  const config = PRIORIDADE_CONFIG[alerta.prioridade];

  if (resolved) return null;

  return (
    <div className={`rounded-xl border ${config.border} bg-card overflow-hidden`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{config.emoji}</span>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{alerta.nomeCliente}</h3>
              <p className="text-xs text-muted-foreground">
                {alerta.responsavel} · {alerta.etapa}
              </p>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${config.color} ${config.bg}`}
          >
            {config.label}
          </span>
        </div>

        {/* Métricas */}
        <div className="flex gap-4 mb-3">
          <div className="flex items-center gap-1.5 text-sm">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{formatBRL(alerta.valor)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`font-medium ${alerta.diasParado >= 5 ? "text-red-500" : "text-foreground"}`}>
              {alerta.diasParado > 0 ? `${alerta.diasParado} dias` : `${alerta.horasParado}h`} parado
            </span>
          </div>
        </div>

        {/* Última atividade */}
        <p className="text-xs text-muted-foreground mb-3">
          Ultima atividade: {formatData(alerta.ultimaAtividade)}
        </p>

        {/* Última resolução */}
        {alerta.ultimaResolucao && (
          <div className="text-xs text-muted-foreground bg-sidebar-accent/50 rounded-lg px-3 py-2 mb-3">
            <span className="font-medium">Ultima acao ({formatData(alerta.ultimaResolucao.resolvidoEm)}):</span>{" "}
            {alerta.ultimaResolucao.acaoTomada}
          </div>
        )}

        {/* Botões */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { setShowResolver(!showResolver); setShowAdormecer(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolver
          </button>
          <button
            onClick={() => { setShowAdormecer(!showAdormecer); setShowResolver(false); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sidebar-accent text-muted-foreground text-xs font-medium hover:text-foreground transition-colors"
          >
            <Moon className="h-3.5 w-3.5" />
            Adormecer
          </button>
        </div>

        {/* Forms */}
        {showResolver && (
          <ResolverForm
            negocioId={alerta.id}
            tipo={alerta.tipo}
            onClose={() => setShowResolver(false)}
            onResolved={() => { setResolved(true); router.refresh(); }}
          />
        )}
        {showAdormecer && (
          <AdormecerForm
            negocioId={alerta.id}
            onClose={() => setShowAdormecer(false)}
            onDone={() => { setResolved(true); router.refresh(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Card: Negócio Adormecido ─────────────────────────────────────────────────

function AdormecidoCard({
  alerta,
  template,
}: {
  alerta: AlertaAdormecido;
  template: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showResolver, setShowResolver] = useState(false);
  const [resolved, setResolved] = useState(false);
  const router = useRouter();

  if (resolved) return null;

  const mensagem = template.replace("[CLIENTE]", alerta.nomeCliente.split(" ")[0]);

  function handleCopy() {
    navigator.clipboard.writeText(mensagem);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`rounded-xl border bg-card overflow-hidden ${
        alerta.recontatoVencido ? "border-red-200" : "border-border"
      }`}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">{alerta.recontatoVencido ? "🔴" : "🟡"}</span>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{alerta.nomeCliente}</h3>
              <p className="text-xs text-muted-foreground">{alerta.responsavel}</p>
            </div>
          </div>
          {alerta.motivoPerda && (
            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-violet-50 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300">
              {MOTIVO_LABELS[alerta.motivoPerda] || alerta.motivoPerda}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm">
            <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{formatBRL(alerta.valor)}</span>
          </div>
          {alerta.dataPerda && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Adormecido em {formatData(alerta.dataPerda)}
            </div>
          )}
        </div>

        {/* Recontato */}
        {alerta.dataRecontato && (
          <div
            className={`rounded-lg px-3 py-2 mb-3 text-xs font-medium ${
              alerta.recontatoVencido
                ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                : "bg-sidebar-accent text-muted-foreground"
            }`}
          >
            {alerta.recontatoVencido ? (
              <>Recontato vencido ha {Math.abs(alerta.diasAteRecontato ?? 0)} dias — Reativar agora</>
            ) : (
              <>Recontato agendado para {formatData(alerta.dataRecontato)} ({alerta.diasAteRecontato} dias)</>
            )}
          </div>
        )}

        {/* Template de mensagem */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mb-2"
        >
          <Send className="h-3.5 w-3.5" />
          Mensagem de reativacao
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {expanded && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-3">
            <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed mb-2">
              {mensagem}
            </p>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
            >
              <Copy className="h-3 w-3" />
              {copied ? "Copiado!" : "Copiar mensagem"}
            </button>
          </div>
        )}

        {/* Última resolução */}
        {alerta.ultimaResolucao && (
          <div className="text-xs text-muted-foreground bg-sidebar-accent/50 rounded-lg px-3 py-2 mb-3">
            <span className="font-medium">Ultima acao ({formatData(alerta.ultimaResolucao.resolvidoEm)}):</span>{" "}
            {alerta.ultimaResolucao.acaoTomada}
          </div>
        )}

        {/* Resolver */}
        <button
          onClick={() => setShowResolver(!showResolver)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          {showResolver ? "Fechar" : "Registrar contato"}
        </button>

        {showResolver && (
          <ResolverForm
            negocioId={alerta.id}
            tipo="reativacao_60d"
            onClose={() => setShowResolver(false)}
            onResolved={() => { setResolved(true); router.refresh(); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AlertasClient({ alertasParados, alertasAdormecidos, contadores, templatesReativacao }: Props) {
  const [tab, setTab] = useState<TabAtiva>("parados");
  const [filtro, setFiltro] = useState<FiltroPrioridade>("todos");

  const paradosFiltrados =
    filtro === "todos"
      ? alertasParados
      : alertasParados.filter((a) => a.prioridade === filtro);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Alertas de Pipeline
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Negocios parados, tickets criticos e reativacoes pendentes
            </p>
          </div>
        </div>

        {/* Contadores */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <CounterCard
            label="Parados >48h"
            value={contadores.totalParados}
            color="bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            icon={<Clock className="h-5 w-5" />}
          />
          <CounterCard
            label="Alta prioridade"
            value={contadores.totalAlta}
            color="bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
            icon={<AlertTriangle className="h-5 w-5" />}
          />
          <CounterCard
            label="Adormecidos"
            value={contadores.totalAdormecidos}
            color="bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400"
            icon={<Moon className="h-5 w-5" />}
          />
          <CounterCard
            label="Recontato vencido"
            value={contadores.totalRecontatoVencido}
            color="bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
            icon={<RefreshCw className="h-5 w-5" />}
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-5 max-w-md rounded-xl bg-sidebar-accent p-1">
          <button
            onClick={() => setTab("parados")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === "parados"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            Parados ({contadores.totalParados})
          </button>
          <button
            onClick={() => setTab("adormecidos")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === "adormecidos"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Moon className="h-4 w-4" />
            Adormecidos ({contadores.totalAdormecidos})
          </button>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-8 space-y-6">
        <ComoFunciona
          proposito="Radar de risco do pipeline: negócios parados há mais de 48h, tickets críticos sem movimento e clientes adormecidos prontos para reativação."
          comoUsar="Alterne entre 'Parados' e 'Adormecidos'. Filtre por prioridade, abra cada alerta e registre a ação tomada — o sistema rastreia a resolução."
          comoAjuda="Recupera receita que estava escapando silenciosamente. Sem essa página, oportunidades ficariam esquecidas no funil até morrerem."
        />
        {tab === "parados" && (
          <>
            {/* Filtros de prioridade */}
            <div className="flex gap-2 flex-wrap mb-5">
              {(["todos", "alta", "media", "baixa"] as FiltroPrioridade[]).map((f) => {
                const labels: Record<FiltroPrioridade, string> = {
                  todos: "Todos",
                  alta: `🔴 Alta (${contadores.totalAlta})`,
                  media: `🟡 Media (${contadores.totalMedia})`,
                  baixa: `🟢 Baixa (${contadores.totalBaixa})`,
                };
                return (
                  <button
                    key={f}
                    onClick={() => setFiltro(f)}
                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      filtro === f
                        ? "bg-primary text-primary-foreground"
                        : "bg-sidebar-accent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>

            {paradosFiltrados.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {filtro === "todos" ? "Nenhum negocio parado" : `Nenhum alerta de prioridade ${filtro}`}
                </h3>
                <p className="text-sm text-muted-foreground">Todos os negocios estao em movimento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {paradosFiltrados.map((a) => (
                  <AlertaParadoCard key={a.id} alerta={a} />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "adormecidos" && (
          <>
            {alertasAdormecidos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <Moon className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum negocio adormecido</h3>
                <p className="text-sm text-muted-foreground">
                  Negocios marcados como adormecidos aparecerao aqui com agenda de recontato.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {alertasAdormecidos.map((a) => (
                  <AdormecidoCard
                    key={a.id}
                    alerta={a}
                    template={templatesReativacao[a.motivoPerda || "outro"] || templatesReativacao.outro}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
