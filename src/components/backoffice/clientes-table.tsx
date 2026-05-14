"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Users,
  Search,
  Edit2,
  Check,
  X,
  RefreshCw,
  MessageCircle,
  Phone,
  Video,
  Loader2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  HelpCircle,
  Download,
  CalendarClock,
  CalendarCheck,
  Wallet,
  TrendingUp,
  UserCircle,
  Filter,
  ChevronDown,
} from "lucide-react";

interface ContatoResumo {
  data: string;
  canal: "whatsapp" | "reuniao" | "ligacao";
  resumo: string;
}

interface Cliente {
  id: string;
  nome: string;
  numeroConta: string;
  saldo: number;
  saldoConta: number;
  classificacao: string;
  classificacaoManual: boolean;
  email: string | null;
  telefone: string | null;
  profissao: string | null;
  nicho: string | null;
  ultimoContatoAt: Date | string | null;
  proximoContatoAt: Date | string | null;
  ultimaReuniaoAt: Date | string | null;
  proximaReuniaoAt: Date | string | null;
  ultimaReuniaoFonte: string | null;
  proximaReuniaoFonte: string | null;
  receitaAnual: number;
  assessorId: string | null;
}

interface Assessor {
  id: string;
  nomeCompleto: string;
  apelido: string | null;
}

type FaixaSaldo = "todos" | "0-10k" | "10k-50k" | "50k-100k" | "100k-500k" | "500k+";
type SortKey =
  | "nome"
  | "saldo"
  | "saldoConta"
  | "receitaAnual"
  | "ultimoContatoAt"
  | "ultimaReuniaoAt"
  | "proximaReuniaoAt"
  | "classificacao";
type SortDir = "asc" | "desc";

const FAIXAS_SALDO: { valor: FaixaSaldo; label: string; min: number; max: number }[] = [
  { valor: "todos", label: "Todos os saldos", min: 0, max: Infinity },
  { valor: "0-10k", label: "Até R$ 10 mil", min: 0, max: 10_000 },
  { valor: "10k-50k", label: "R$ 10k – 50k", min: 10_000, max: 50_000 },
  { valor: "50k-100k", label: "R$ 50k – 100k", min: 50_000, max: 100_000 },
  { valor: "100k-500k", label: "R$ 100k – 500k", min: 100_000, max: 500_000 },
  { valor: "500k+", label: "Acima de R$ 500k", min: 500_000, max: Infinity },
];

const classCores: Record<string, string> = {
  A: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200",
  B: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-900/30 dark:text-blue-200",
  C: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-900/50 dark:text-zinc-300",
};

const classLegenda: Record<string, string> = {
  A: "Top clientes · 12-4-2",
  B: "Relacionamento ativo",
  C: "Manutenção",
};

const canalIcone: Record<string, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  reuniao: Video,
  ligacao: Phone,
};

const canalCor: Record<string, string> = {
  whatsapp: "text-green-600",
  reuniao: "text-blue-600",
  ligacao: "text-amber-600",
};

// Cadência 12-4-2 (clientes A): contato em até 30 dias é o "saudável".
// Limites para badge de atenção:
const CADENCIA_DIAS: Record<string, { atencao: number; alerta: number }> = {
  A: { atencao: 30, alerta: 45 },
  B: { atencao: 90, alerta: 120 },
  C: { atencao: 180, alerta: 270 },
};

const SALDO_PARADO_LIMITE = 50_000;

export function ClientesTable({
  clientes: iniciais,
  assessores,
}: {
  clientes: Cliente[];
  assessores: Assessor[];
}) {
  const [clientes, setClientes] = useState(iniciais);

  // Filtros
  const [busca, setBusca] = useState("");
  const [filtroClasse, setFiltroClasse] = useState<"todos" | "A" | "B" | "C">("todos");
  const [filtroSaldoConta, setFiltroSaldoConta] = useState<FaixaSaldo>("todos");
  const [filtroAssessor, setFiltroAssessor] = useState<string>("todos");
  const [foraCadencia, setForaCadencia] = useState(false);
  const [semProximaReuniao, setSemProximaReuniao] = useState(false);
  const [saldoParado, setSaldoParado] = useState(false);
  const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);

  // Ordenação
  const [sortKey, setSortKey] = useState<SortKey>("saldo");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Seleção múltipla
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  // Estados de operação
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoAssessor, setEditandoAssessor] = useState<string | null>(null);
  const [sincronizandoBtg, setSincronizandoBtg] = useState(false);
  const [sincronizandoReunioes, setSincronizandoReunioes] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [buscandoContatos, setBuscandoContatos] = useState(false);
  const [contatos, setContatos] = useState<Record<string, ContatoResumo[]>>({});
  const [contatosCarregados, setContatosCarregados] = useState(false);
  const [marcandoContato, setMarcandoContato] = useState(false);

  // Helpers
  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const diasDesde = (data: Date | string | null): number | null => {
    if (!data) return null;
    const d = new Date(data);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const diasAte = (data: Date | string | null): number | null => {
    if (!data) return null;
    const d = new Date(data);
    return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const formatData = (data: Date | string | null): string => {
    if (!data) return "—";
    return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  };

  const statusCadencia = (cliente: Cliente): "ok" | "atencao" | "alerta" => {
    const limite = CADENCIA_DIAS[cliente.classificacao] || CADENCIA_DIAS.C;
    const dias = diasDesde(cliente.ultimoContatoAt);
    if (dias === null) return "alerta"; // nunca contatou
    if (dias >= limite.alerta) return "alerta";
    if (dias >= limite.atencao) return "atencao";
    return "ok";
  };

  const assessorMap = useMemo(() => {
    const m = new Map<string, Assessor>();
    for (const a of assessores) m.set(a.id, a);
    return m;
  }, [assessores]);

  // KPIs do topo
  const kpis = useMemo(() => {
    const totalA = clientes.filter((c) => c.classificacao === "A").length;
    const aForaCadencia = clientes.filter(
      (c) => c.classificacao === "A" && statusCadencia(c) !== "ok"
    ).length;
    const pctAOk = totalA > 0 ? Math.round(((totalA - aForaCadencia) / totalA) * 100) : 100;

    const proximaSemana = new Date();
    proximaSemana.setDate(proximaSemana.getDate() + 7);
    const reunioesSemana = clientes.filter((c) => {
      if (!c.proximaReuniaoAt) return false;
      const d = new Date(c.proximaReuniaoAt);
      return d.getTime() >= Date.now() && d <= proximaSemana;
    }).length;

    const saldoParadoTotal = clientes
      .filter((c) => c.saldoConta >= SALDO_PARADO_LIMITE)
      .reduce((sum, c) => sum + c.saldoConta, 0);

    const receitaTotal = clientes.reduce((sum, c) => sum + c.receitaAnual, 0);

    return { pctAOk, totalA, aForaCadencia, reunioesSemana, saldoParadoTotal, receitaTotal };
  }, [clientes]);

  // Filtragem
  const filtrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroClasse !== "todos" && c.classificacao !== filtroClasse) return false;
      if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase()) && !c.numeroConta.includes(busca)) return false;
      if (filtroSaldoConta !== "todos") {
        const faixa = FAIXAS_SALDO.find((f) => f.valor === filtroSaldoConta);
        if (faixa && (c.saldoConta < faixa.min || c.saldoConta >= faixa.max)) return false;
      }
      if (filtroAssessor === "sem_assessor" && c.assessorId) return false;
      if (filtroAssessor !== "todos" && filtroAssessor !== "sem_assessor" && c.assessorId !== filtroAssessor)
        return false;
      if (foraCadencia && statusCadencia(c) === "ok") return false;
      if (semProximaReuniao && c.proximaReuniaoAt) return false;
      if (saldoParado && c.saldoConta < SALDO_PARADO_LIMITE) return false;
      return true;
    });
  }, [clientes, busca, filtroClasse, filtroSaldoConta, filtroAssessor, foraCadencia, semProximaReuniao, saldoParado]);

  // Ordenação
  const ordenados = useMemo(() => {
    const arr = [...filtrados];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" && typeof vb === "string") {
        return va.localeCompare(vb) * dir;
      }
      if (va instanceof Date || typeof va === "string") {
        return (new Date(va as string).getTime() - new Date(vb as string).getTime()) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
    return arr;
  }, [filtrados, sortKey, sortDir]);

  const contadores = {
    A: clientes.filter((c) => c.classificacao === "A").length,
    B: clientes.filter((c) => c.classificacao === "B").length,
    C: clientes.filter((c) => c.classificacao === "C").length,
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "nome" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  // ─── Operações ──────────────────────────────────────────────────────────

  const sincronizarBtg = async () => {
    if (sincronizandoBtg) return;
    if (!confirm("Sincronizar saldos de todos os clientes via BTG Pactual?")) return;
    setSincronizandoBtg(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/btg-sync", { method: "POST" });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
      if (data.detalhes && Array.isArray(data.detalhes)) {
        setClientes((prev) =>
          prev.map((c) => {
            const det = data.detalhes.find((d: { conta: string }) => d.conta === c.numeroConta);
            return det ? { ...c, saldo: det.saldoNovo, saldoConta: det.saldoConta ?? c.saldoConta } : c;
          })
        );
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSincronizandoBtg(false);
    }
  };

  const sincronizarReunioes = async () => {
    if (sincronizandoReunioes) return;
    if (!confirm("Buscar última e próxima reunião de todos os clientes via Plaud + Google Calendar?")) return;
    setSincronizandoReunioes(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/clientes/sync-reunioes", { method: "POST" });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
      // Recarrega a página para puxar dados atualizados
      if (data.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSincronizandoReunioes(false);
    }
  };

  const buscarUltimosContatos = async () => {
    if (buscandoContatos) return;
    setBuscandoContatos(true);
    try {
      const res = await fetch("/api/backoffice/clientes/ultimos-contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.contatos) {
        setContatos(data.contatos);
        setContatosCarregados(true);
        // Atualiza ultimoContatoAt no estado local com a data mais recente de cada cliente
        setClientes((prev) =>
          prev.map((c) => {
            const cts = data.contatos[c.id];
            if (cts && cts.length > 0 && cts[0].data) {
              return { ...c, ultimoContatoAt: cts[0].data };
            }
            return c;
          })
        );
      }
    } catch (e) {
      console.error("Erro ao buscar contatos:", e);
    } finally {
      setBuscandoContatos(false);
    }
  };

  const atualizarClasse = async (id: string, novaClasse: string) => {
    const res = await fetch(`/api/backoffice/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: novaClasse, classificacaoManual: true }),
    });
    if (res.ok) {
      setClientes((prev) =>
        prev.map((c) => (c.id === id ? { ...c, classificacao: novaClasse, classificacaoManual: true } : c))
      );
      setEditando(null);
    }
  };

  const atualizarAssessor = async (clienteId: string, assessorId: string) => {
    const res = await fetch(`/api/backoffice/clientes/${clienteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assessorId: assessorId || "" }),
    });
    if (res.ok) {
      setClientes((prev) =>
        prev.map((c) => (c.id === clienteId ? { ...c, assessorId: assessorId || null } : c))
      );
      setEditandoAssessor(null);
    }
  };

  const toggleSelecionado = (id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selecionarTodos = () => {
    if (selecionados.size === ordenados.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(ordenados.map((c) => c.id)));
    }
  };

  const limparFiltros = () => {
    setFiltroClasse("todos");
    setFiltroSaldoConta("todos");
    setFiltroAssessor("todos");
    setForaCadencia(false);
    setSemProximaReuniao(false);
    setSaldoParado(false);
    setBusca("");
  };

  const filtrosAtivos =
    filtroClasse !== "todos" ||
    filtroSaldoConta !== "todos" ||
    filtroAssessor !== "todos" ||
    foraCadencia ||
    semProximaReuniao ||
    saldoParado ||
    !!busca;

  const exportarCSV = () => {
    const alvo = selecionados.size > 0 ? ordenados.filter((c) => selecionados.has(c.id)) : ordenados;
    const cabecalhos = [
      "Classe",
      "Nome",
      "Conta",
      "AUM",
      "Saldo Conta",
      "Receita/ano",
      "Assessor",
      "Telefone",
      "Email",
      "Último contato",
      "Última reunião",
      "Próxima reunião",
    ];
    const linhas = alvo.map((c) => [
      c.classificacao,
      c.nome,
      c.numeroConta,
      c.saldo.toFixed(2).replace(".", ","),
      c.saldoConta.toFixed(2).replace(".", ","),
      c.receitaAnual.toFixed(2).replace(".", ","),
      c.assessorId ? assessorMap.get(c.assessorId)?.nomeCompleto || "" : "",
      c.telefone || "",
      c.email || "",
      c.ultimoContatoAt ? new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR") : "",
      c.ultimaReuniaoAt ? new Date(c.ultimaReuniaoAt).toLocaleDateString("pt-BR") : "",
      c.proximaReuniaoAt ? new Date(c.proximaReuniaoAt).toLocaleDateString("pt-BR") : "",
    ]);
    const csv = [cabecalhos, ...linhas]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const marcarContatadosHoje = async () => {
    if (selecionados.size === 0) return;
    if (!confirm(`Marcar ${selecionados.size} cliente(s) como contatado(s) hoje?`)) return;
    setMarcandoContato(true);
    const hoje = new Date().toISOString();
    try {
      const ids = Array.from(selecionados);
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/backoffice/clientes/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ultimoContatoAt: hoje }),
          })
        )
      );
      setClientes((prev) =>
        prev.map((c) => (selecionados.has(c.id) ? { ...c, ultimoContatoAt: hoje } : c))
      );
      setSelecionados(new Set());
    } catch (e) {
      console.error("Erro ao marcar contatos:", e);
    } finally {
      setMarcandoContato(false);
    }
  };

  const whatsappLink = (telefone: string | null) => {
    if (!telefone) return null;
    const limpo = telefone.replace(/\D/g, "");
    if (limpo.length < 10) return null;
    const comDdi = limpo.startsWith("55") ? limpo : `55${limpo}`;
    return `https://wa.me/${comDdi}`;
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Painel de saúde — KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Clientes A na cadência"
          value={`${kpis.pctAOk}%`}
          sub={`${kpis.totalA - kpis.aForaCadencia}/${kpis.totalA} dentro do 12-4-2`}
          tone={kpis.pctAOk >= 80 ? "ok" : kpis.pctAOk >= 60 ? "atencao" : "alerta"}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Reuniões próx. 7 dias"
          value={String(kpis.reunioesSemana)}
          sub="agendadas no Calendar"
          tone="neutro"
        />
        <KpiCard
          icon={Wallet}
          label="Saldo parado em conta"
          value={moeda(kpis.saldoParadoTotal)}
          sub={`clientes com >${moeda(SALDO_PARADO_LIMITE)}`}
          tone={kpis.saldoParadoTotal > 0 ? "atencao" : "neutro"}
        />
        <KpiCard
          icon={TrendingUp}
          label="Receita/ano da base"
          value={moeda(kpis.receitaTotal)}
          sub={`${clientes.length} clientes`}
          tone="neutro"
        />
      </div>

      {/* Contadores por classe (clicáveis para filtrar) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(["A", "B", "C"] as const).map((classe) => (
          <button
            key={classe}
            onClick={() => setFiltroClasse(filtroClasse === classe ? "todos" : classe)}
            className={`rounded-xl border p-4 text-left transition-all ${
              filtroClasse === classe ? "ring-2 ring-primary" : ""
            } ${classCores[classe]}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-3xl font-bold">{classe}</span>
              <span className="text-2xl font-semibold">{contadores[classe]}</span>
            </div>
            <p className="text-xs font-medium flex items-center gap-1">
              {classLegenda[classe]}
              {classe === "A" && (
                <span
                  title="Cadência mínima para clientes A: 12 contatos, 4 reuniões e 2 revisões por ano (modelo Supernova). Equivale a um contato a cada ~30 dias."
                  className="cursor-help"
                >
                  <HelpCircle className="h-3 w-3 opacity-60" />
                </span>
              )}
            </p>
          </button>
        ))}
      </div>

      {/* Linha de busca + ações principais */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou conta..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        <button
          onClick={() => setFiltrosExpandidos(!filtrosExpandidos)}
          className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${
            filtrosAtivos ? "bg-primary/10 border-primary/40" : ""
          }`}
        >
          <Filter className="h-4 w-4" />
          Filtros {filtrosAtivos && <span className="text-xs">●</span>}
          <ChevronDown className={`h-3 w-3 transition-transform ${filtrosExpandidos ? "rotate-180" : ""}`} />
        </button>

        <button
          onClick={buscarUltimosContatos}
          disabled={buscandoContatos}
          className="px-3 py-2 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400 text-sm flex items-center gap-2 hover:bg-violet-500/20 disabled:opacity-50"
          title="Buscar últimos contatos via Datacraze (WhatsApp) — persiste no banco"
        >
          {buscandoContatos ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          {buscandoContatos ? "Buscando..." : "Buscar contatos"}
        </button>

        <button
          onClick={sincronizarReunioes}
          disabled={sincronizandoReunioes}
          className="px-3 py-2 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 text-sm flex items-center gap-2 hover:bg-blue-500/20 disabled:opacity-50"
          title="Buscar última e próxima reunião via Plaud + Google Calendar"
        >
          {sincronizandoReunioes ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {sincronizandoReunioes ? "Sincronizando..." : "Sincronizar reuniões"}
        </button>

        <button
          onClick={sincronizarBtg}
          disabled={sincronizandoBtg}
          className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2 hover:bg-emerald-500/20 disabled:opacity-50"
          title="Buscar saldos atualizados via BTG Partner API"
        >
          <RefreshCw className={`h-4 w-4 ${sincronizandoBtg ? "animate-spin" : ""}`} />
          {sincronizandoBtg ? "Sincronizando..." : "Sincronizar saldos BTG"}
        </button>

        <button
          onClick={exportarCSV}
          className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          title="Exportar para CSV (Excel)"
        >
          <Download className="h-4 w-4" />
          Exportar CSV {selecionados.size > 0 && `(${selecionados.size})`}
        </button>
      </div>

      {/* Filtros avançados expansíveis */}
      {filtrosExpandidos && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Faixa de saldo em conta</label>
              <select
                value={filtroSaldoConta}
                onChange={(e) => setFiltroSaldoConta(e.target.value as FaixaSaldo)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              >
                {FAIXAS_SALDO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Assessor</label>
              <select
                value={filtroAssessor}
                onChange={(e) => setFiltroAssessor(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="todos">Todos os assessores</option>
                <option value="sem_assessor">Sem assessor atribuído</option>
                {assessores.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.apelido || a.nomeCompleto}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={foraCadencia}
                onChange={(e) => setForaCadencia(e.target.checked)}
                className="rounded"
              />
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Fora da cadência 12-4-2
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={semProximaReuniao}
                onChange={(e) => setSemProximaReuniao(e.target.checked)}
                className="rounded"
              />
              <CalendarClock className="h-4 w-4 text-blue-600" />
              Sem próxima reunião agendada
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={saldoParado}
                onChange={(e) => setSaldoParado(e.target.checked)}
                className="rounded"
              />
              <Wallet className="h-4 w-4 text-amber-600" />
              Saldo parado &gt; {moeda(SALDO_PARADO_LIMITE)}
            </label>

            {filtrosAtivos && (
              <button
                onClick={limparFiltros}
                className="ml-auto px-3 py-1 text-xs rounded border flex items-center gap-1"
              >
                Limpar tudo <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {syncResult && (
        <div
          className={`px-4 py-3 rounded-lg text-sm border ${
            syncResult.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
          }`}
        >
          {syncResult.msg}
        </div>
      )}

      {/* Barra de ações em massa (quando há seleção) */}
      {selecionados.size > 0 && (
        <div className="rounded-lg border bg-primary/5 border-primary/30 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="font-medium">{selecionados.size} selecionado(s)</span>
          <button
            onClick={marcarContatadosHoje}
            disabled={marcandoContato}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs flex items-center gap-1 hover:bg-emerald-700 disabled:opacity-50"
          >
            {marcandoContato ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Marcar contatados hoje
          </button>
          <button
            onClick={exportarCSV}
            className="px-3 py-1.5 rounded-md border text-xs flex items-center gap-1"
          >
            <Download className="h-3 w-3" />
            Exportar selecionados
          </button>
          <button onClick={() => setSelecionados(new Set())} className="ml-auto text-xs underline">
            Limpar seleção
          </button>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">
            Clientes — exibindo {ordenados.length}
            {ordenados.length !== clientes.length && ` de ${clientes.length}`}
          </h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Ordenado por <strong>{sortKey}</strong> ({sortDir === "asc" ? "crescente" : "decrescente"})
          </span>
        </div>
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={selecionados.size === ordenados.length && ordenados.length > 0}
                    onChange={selecionarTodos}
                    className="rounded"
                  />
                </th>
                <Th onClick={() => toggleSort("classificacao")}>
                  Classe <SortIcon k="classificacao" />
                </Th>
                <Th onClick={() => toggleSort("nome")}>
                  Nome <SortIcon k="nome" />
                </Th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Conta</th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground">Assessor</th>
                <Th align="right" onClick={() => toggleSort("saldo")}>
                  AUM <SortIcon k="saldo" />
                </Th>
                <Th align="right" onClick={() => toggleSort("saldoConta")}>
                  Saldo Conta <SortIcon k="saldoConta" />
                </Th>
                <Th align="right" onClick={() => toggleSort("receitaAnual")}>
                  Receita/ano <SortIcon k="receitaAnual" />
                </Th>
                <Th onClick={() => toggleSort("ultimoContatoAt")}>
                  Último contato <SortIcon k="ultimoContatoAt" />
                </Th>
                <Th onClick={() => toggleSort("ultimaReuniaoAt")}>
                  Última reunião <SortIcon k="ultimaReuniaoAt" />
                </Th>
                <Th onClick={() => toggleSort("proximaReuniaoAt")}>
                  Próxima reunião <SortIcon k="proximaReuniaoAt" />
                </Th>
                <th className="text-left px-3 py-3 font-medium text-muted-foreground w-20">Ações</th>
                {contatosCarregados && (
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Contatos recentes</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ordenados.map((c) => {
                const cadencia = statusCadencia(c);
                const assessor = c.assessorId ? assessorMap.get(c.assessorId) : null;
                const waLink = whatsappLink(c.telefone);
                const diasContato = diasDesde(c.ultimoContatoAt);
                const diasProxReuniao = diasAte(c.proximaReuniaoAt);

                return (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selecionados.has(c.id)}
                        onChange={() => toggleSelecionado(c.id)}
                        className="rounded"
                      />
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {editando === c.id ? (
                          <div className="flex items-center gap-1">
                            {(["A", "B", "C"] as const).map((cl) => (
                              <button
                                key={cl}
                                onClick={() => atualizarClasse(c.id, cl)}
                                className={`w-7 h-7 rounded text-xs font-bold ${classCores[cl]}`}
                              >
                                {cl}
                              </button>
                            ))}
                            <button onClick={() => setEditando(null)} className="ml-1 text-muted-foreground">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setEditando(c.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-bold ${
                              classCores[c.classificacao]
                            }`}
                            title={
                              c.classificacaoManual
                                ? "Classificação travada (manual)"
                                : "Classificação automática — clique para alterar"
                            }
                          >
                            {c.classificacao}
                            {c.classificacaoManual ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Edit2 className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        )}
                        {cadencia !== "ok" && c.classificacao === "A" && (
                          <span
                            title={`Cliente A fora da cadência 12-4-2 (último contato há ${
                              diasContato === null ? "—" : `${diasContato} dias`
                            }). Limite: 30 dias.`}
                          >
                            <AlertTriangle
                              className={`h-3.5 w-3.5 ${
                                cadencia === "alerta" ? "text-red-500" : "text-amber-500"
                              }`}
                            />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 font-medium">
                      <Link
                        href={`/backoffice/clientes/${c.id}`}
                        className="hover:underline hover:text-primary"
                        title={[
                          c.nome,
                          c.email ? `E-mail: ${c.email}` : null,
                          c.telefone ? `Tel: ${c.telefone}` : null,
                          c.profissao ? `Profissão: ${c.profissao}` : null,
                          c.nicho ? `Nicho: ${c.nicho}` : null,
                        ]
                          .filter(Boolean)
                          .join("\n")}
                      >
                        {c.nome}
                      </Link>
                    </td>

                    <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{c.numeroConta}</td>

                    <td className="px-3 py-3 text-xs">
                      {editandoAssessor === c.id ? (
                        <div className="flex items-center gap-1">
                          <select
                            defaultValue={c.assessorId || ""}
                            onChange={(e) => atualizarAssessor(c.id, e.target.value)}
                            className="px-2 py-1 rounded border bg-background text-xs"
                            autoFocus
                          >
                            <option value="">— sem assessor —</option>
                            {assessores.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.apelido || a.nomeCompleto}
                              </option>
                            ))}
                          </select>
                          <button onClick={() => setEditandoAssessor(null)} className="text-muted-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditandoAssessor(c.id)}
                          className="inline-flex items-center gap-1 hover:underline"
                          title="Clique para atribuir um assessor"
                        >
                          <UserCircle className="h-3 w-3 opacity-60" />
                          {assessor ? assessor.apelido || assessor.nomeCompleto.split(" ")[0] : (
                            <span className="text-muted-foreground italic">sem assessor</span>
                          )}
                        </button>
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-mono">{moeda(c.saldo)}</td>
                    <td className="px-3 py-3 text-right font-mono">
                      {c.saldoConta > 0 ? (
                        <span
                          className={
                            c.saldoConta >= SALDO_PARADO_LIMITE
                              ? "text-amber-700 dark:text-amber-400 font-semibold"
                              : "text-emerald-700 dark:text-emerald-400"
                          }
                          title={
                            c.saldoConta >= SALDO_PARADO_LIMITE
                              ? "Saldo elevado em conta — oportunidade de alocação"
                              : undefined
                          }
                        >
                          {moeda(c.saldoConta)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-muted-foreground">
                      {moeda(c.receitaAnual)}
                    </td>

                    <td className="px-3 py-3 text-xs">
                      {c.ultimoContatoAt ? (
                        <span
                          className={
                            cadencia === "alerta"
                              ? "text-red-600 dark:text-red-400"
                              : cadencia === "atencao"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground"
                          }
                          title={`Há ${diasContato} dias`}
                        >
                          {formatData(c.ultimoContatoAt)}
                          {diasContato !== null && diasContato > 0 && (
                            <span className="ml-1 opacity-60">({diasContato}d)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {c.ultimaReuniaoAt ? (
                        <span title={c.ultimaReuniaoFonte ? `Fonte: ${c.ultimaReuniaoFonte}` : undefined}>
                          {formatData(c.ultimaReuniaoAt)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-3 py-3 text-xs">
                      {c.proximaReuniaoAt ? (
                        <span
                          className={
                            diasProxReuniao !== null && diasProxReuniao <= 7
                              ? "text-blue-700 dark:text-blue-400 font-semibold"
                              : "text-muted-foreground"
                          }
                          title={
                            diasProxReuniao !== null
                              ? `Em ${diasProxReuniao} dia(s)`
                              : undefined
                          }
                        >
                          {formatData(c.proximaReuniaoAt)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    <td className="px-3 py-3">
                      {waLink ? (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-500/20 text-xs"
                          title={`Abrir WhatsApp com ${c.telefone}`}
                        >
                          <MessageCircle className="h-3 w-3" />
                          WhatsApp
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">sem tel</span>
                      )}
                    </td>

                    {contatosCarregados && (
                      <td className="px-3 py-3">
                        <ContatosBadges contatos={contatos[c.id] || []} />
                      </td>
                    )}
                  </tr>
                );
              })}
              {ordenados.length === 0 && (
                <tr>
                  <td colSpan={contatosCarregados ? 13 : 12} className="px-4 py-8 text-center text-muted-foreground">
                    {clientes.length === 0
                      ? "Nenhum cliente importado. Use o upload no painel principal."
                      : "Nenhum cliente encontrado com os filtros atuais."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────

function Th({
  children,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`${align === "right" ? "text-right" : "text-left"} px-3 py-3 font-medium text-muted-foreground ${
        onClick ? "cursor-pointer select-none hover:text-foreground" : ""
      }`}
      onClick={onClick}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
      </span>
    </th>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "atencao" | "alerta" | "neutro";
}) {
  const tones: Record<string, string> = {
    ok: "border-emerald-500/30 bg-emerald-500/5",
    atencao: "border-amber-500/30 bg-amber-500/5",
    alerta: "border-red-500/30 bg-red-500/5",
    neutro: "border-border bg-muted/30",
  };
  const iconTones: Record<string, string> = {
    ok: "text-emerald-600",
    atencao: "text-amber-600",
    alerta: "text-red-600",
    neutro: "text-muted-foreground",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`h-4 w-4 ${iconTones[tone]}`} />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ContatosBadges({ contatos }: { contatos: ContatoResumo[] }) {
  if (contatos.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {contatos.map((c, i) => {
        const Icone = canalIcone[c.canal] || Phone;
        const cor = canalCor[c.canal] || "text-zinc-500";
        const dataFormatada = c.data
          ? new Date(c.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
          : "";
        return (
          <div key={i} className="flex items-center gap-1.5 text-xs" title={c.resumo}>
            <Icone className={`h-3.5 w-3.5 flex-shrink-0 ${cor}`} />
            <span className="text-muted-foreground">{dataFormatada}</span>
            <span className="truncate max-w-[120px] text-foreground/70">{c.resumo.substring(0, 40)}</span>
          </div>
        );
      })}
    </div>
  );
}
