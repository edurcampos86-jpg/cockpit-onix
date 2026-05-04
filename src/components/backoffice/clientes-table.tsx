"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Users, Search, Edit2, Check, X, RefreshCw, MessageCircle, Phone, Video, Loader2, Download, Sparkles, Activity, CalendarClock, CalendarPlus, FileSpreadsheet, Upload } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    XLSX: any;
  }
}

const HEADER_MAP: Record<string, string> = {
  nome: "nome",
  name: "nome",
  cliente: "nome",
  numeroconta: "numeroConta",
  numerodaconta: "numeroConta",
  numero_conta: "numeroConta",
  conta: "numeroConta",
  account: "numeroConta",
  nconta: "numeroConta",
  cpf: "cpfCnpj",
  cnpj: "cpfCnpj",
  cpfcnpj: "cpfCnpj",
  documento: "cpfCnpj",
  saldo: "saldo",
  aum: "saldo",
  patrimonio: "saldo",
  balance: "saldo",
  saldoconta: "saldoConta",
  saldocontacorrente: "saldoConta",
  saldocc: "saldoConta",
  cash: "saldoConta",
  email: "email",
  emailprincipal: "email",
  telefone: "telefone",
  celular: "telefone",
  fone: "telefone",
  whatsapp: "telefone",
  profissao: "profissao",
  profession: "profissao",
  ocupacao: "profissao",
  nicho: "nicho",
  segmento: "nicho",
  classificacao: "classificacao",
  classe: "classificacao",
  abc: "classificacao",
  receita: "receitaAnual",
  receitaanual: "receitaAnual",
  receitaano: "receitaAnual",
};

function normHeader(h: string): string {
  return String(h)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function mapRowToCliente(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const target = HEADER_MAP[normHeader(k)];
    if (!target) continue;
    if (out[target] === undefined || out[target] === "") out[target] = v;
  }
  return out;
}

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
  ultimaReuniaoAt: Date | string | null;
  proximaReuniaoAt: Date | string | null;
  proximoContatoAt: Date | string | null;
  receitaAnual: number;
}

type FaixaSaldo = "todos" | "0-10k" | "10k-50k" | "50k-100k" | "100k-500k" | "500k+";

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

const canalLabel: Record<string, string> = {
  whatsapp: "WhatsApp",
  reuniao: "Reunião",
  ligacao: "Ligação",
};

export function ClientesTable({
  clientes: iniciais,
  isAdmin = false,
}: {
  clientes: Cliente[];
  isAdmin?: boolean;
}) {
  const [clientes, setClientes] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtroClasse, setFiltroClasse] = useState<"todos" | "A" | "B" | "C">("todos");
  const [filtroSaldoConta, setFiltroSaldoConta] = useState<FaixaSaldo>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [enriquecendo, setEnriquecendo] = useState(false);
  const [sincMovs, setSincMovs] = useState(false);
  const [syncDatacrazy, setSyncDatacrazy] = useState(false);
  const [syncOutlook, setSyncOutlook] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [buscandoContatos, setBuscandoContatos] = useState(false);
  const [contatos, setContatos] = useState<Record<string, ContatoResumo[]>>({});
  const [contatosCarregados, setContatosCarregados] = useState(false);
  const [importandoPlanilha, setImportandoPlanilha] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAdmin) return;
    if (typeof window === "undefined") return;
    if (window.XLSX) {
      setXlsxReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
  }, [isAdmin]);

  const importarPlanilha = async (file: File) => {
    if (importandoPlanilha) return;
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (![".xlsx", ".xls", ".csv"].includes(ext)) {
      setSyncResult({ ok: false, msg: "Formato inválido. Use .xlsx, .xls ou .csv." });
      return;
    }
    if (!xlsxReady || !window.XLSX) {
      setSyncResult({ ok: false, msg: "Biblioteca de leitura ainda carregando, tente em 1s." });
      return;
    }
    setImportandoPlanilha(true);
    setSyncResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: Record<string, unknown>[] = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = rows.map(mapRowToCliente).filter((c) => String(c.nome ?? "").trim().length > 0);
      if (parsed.length === 0) {
        setSyncResult({ ok: false, msg: "Nenhuma linha válida. Verifique se há coluna 'nome'." });
        return;
      }
      const res = await fetch("/api/backoffice/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientes: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ ok: false, msg: data.error || "Erro ao importar." });
        return;
      }
      setSyncResult({ ok: true, msg: data.message || "Importação concluída." });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro ao processar arquivo." });
    } finally {
      setImportandoPlanilha(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const exportarPlanilha = async () => {
    if (exportando) return;
    if (!xlsxReady || !window.XLSX) {
      setSyncResult({ ok: false, msg: "Biblioteca de exportação ainda carregando, tente em 1s." });
      return;
    }
    setExportando(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/clientes");
      const data = await res.json();
      if (!res.ok) {
        setSyncResult({ ok: false, msg: data.error || "Erro ao buscar clientes." });
        return;
      }
      const rows = (data.clientes || []).map((c: Record<string, unknown>) => ({
        nome: c.nome ?? "",
        numero_conta: c.numeroConta ?? "",
        cpf_cnpj: c.cpfCnpj ?? "",
        saldo: c.saldo ?? 0,
        saldo_conta: c.saldoConta ?? 0,
        classificacao: c.classificacao ?? "",
        email: c.email ?? "",
        telefone: c.telefone ?? "",
        profissao: c.profissao ?? "",
        nicho: c.nicho ?? "",
        receita_anual: c.receitaAnual ?? 0,
        ultimo_contato: c.ultimoContatoAt
          ? new Date(c.ultimoContatoAt as string).toISOString().slice(0, 10)
          : "",
        ultima_reuniao: c.ultimaReuniaoAt
          ? new Date(c.ultimaReuniaoAt as string).toISOString().slice(0, 10)
          : "",
        proxima_reuniao: c.proximaReuniaoAt
          ? new Date(c.proximaReuniaoAt as string).toISOString().slice(0, 10)
          : "",
        proximo_contato: c.proximoContatoAt
          ? new Date(c.proximoContatoAt as string).toISOString().slice(0, 10)
          : "",
      }));
      const ws = window.XLSX.utils.json_to_sheet(rows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "Clientes");
      const stamp = new Date().toISOString().slice(0, 10);
      window.XLSX.writeFile(wb, `clientes-onix-${stamp}.xlsx`);
      setSyncResult({ ok: true, msg: `${rows.length} clientes exportados.` });
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro ao exportar." });
    } finally {
      setExportando(false);
    }
  };

  const sincronizarBtg = async () => {
    if (sincronizando) return;
    if (!confirm("Sincronizar saldos de todos os clientes via BTG Pactual? Pode levar alguns segundos.")) return;
    setSincronizando(true);
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
      setSincronizando(false);
    }
  };

  const importarBtg = async () => {
    if (importando) return;
    if (!confirm("Importar todos os clientes do BTG via Base de Contas + Dados Cadastrais + Saldo + Posição? Pode levar alguns minutos por causa do rate limit do Dados Cadastrais (60 req/min).")) return;
    setImportando(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/btg-import", { method: "POST" });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
      if (data.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setImportando(false);
    }
  };

  const enriquecerBtg = async () => {
    if (enriquecendo) return;
    if (!confirm("Enriquecer todos os clientes com Suitability + Assessor + Receita do BTG? Vai rodar em batches de 20 — pode levar alguns minutos.")) return;
    setEnriquecendo(true);
    setSyncResult(null);
    let offset = 0;
    let totalEnriquecidos = 0;
    let totalSuit = 0;
    let totalAssessor = 0;
    let totalReceita = 0;
    let totalErros = 0;
    try {
      while (true) {
        setSyncResult({ ok: true, msg: `Enriquecendo... batch a partir do offset ${offset}` });
        const res = await fetch(`/api/backoffice/btg-enrich?offset=${offset}&limit=20`, { method: "POST" });
        const data = await res.json();
        if (!data.success) {
          setSyncResult({ ok: false, msg: data.message || "Erro" });
          break;
        }
        totalEnriquecidos += data.enriquecidos || 0;
        totalSuit += data.comSuitability || 0;
        totalAssessor += data.comAssessor || 0;
        totalReceita += data.comReceita || 0;
        totalErros += (data.erros?.length || 0);
        offset = data.nextOffset;
        setSyncResult({
          ok: true,
          msg: `Progresso: ${offset}/${data.totalClientes} · ${totalEnriquecidos} enriquecidos · ${totalSuit} c/ suitability · ${totalAssessor} c/ assessor · ${totalReceita} c/ receita${totalErros > 0 ? ` · ${totalErros} erros` : ""}`,
        });
        if (!data.hasMore) {
          setSyncResult({
            ok: true,
            msg: `Concluído! ${totalEnriquecidos}/${data.totalClientes} enriquecidos · ${totalSuit} c/ suitability · ${totalAssessor} c/ assessor · ${totalReceita} c/ receita${totalErros > 0 ? ` · ${totalErros} erros` : ""}`,
          });
          break;
        }
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setEnriquecendo(false);
    }
  };

  const sincronizarMovimentacoes = async () => {
    if (sincMovs) return;
    if (!confirm("Sincronizar movimentações dos últimos 7 dias?")) return;
    setSincMovs(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/btg-movements-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "weekly" }),
      });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSincMovs(false);
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
      }
    } catch (e) {
      console.error("Erro ao buscar contatos:", e);
    } finally {
      setBuscandoContatos(false);
    }
  };

  const sincronizarDatacrazy = async () => {
    if (syncDatacrazy) return;
    if (!confirm("Sincronizar com Datacrazy + Plaud? Atualiza último contato e última reunião pra cada cliente. Pode levar alguns minutos.")) return;
    setSyncDatacrazy(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/datacrazy-sync", { method: "POST" });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
      if (data.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSyncDatacrazy(false);
    }
  };

  const sincronizarOutlook = async () => {
    if (syncOutlook) return;
    if (!confirm("Sincronizar próxima reunião agendada via Outlook (ICS)? Lê próximos 60 dias e atribui a cada cliente cujo email aparece no evento.")) return;
    setSyncOutlook(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/backoffice/outlook-sync", { method: "POST" });
      const data = await res.json();
      setSyncResult({ ok: !!data.success, msg: data.message || "Erro" });
      if (data.success) {
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (e) {
      setSyncResult({ ok: false, msg: e instanceof Error ? e.message : "Erro" });
    } finally {
      setSyncOutlook(false);
    }
  };

  const filtrados = clientes.filter((c) => {
    if (filtroClasse !== "todos" && c.classificacao !== filtroClasse) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    if (filtroSaldoConta !== "todos") {
      const faixa = FAIXAS_SALDO.find((f) => f.valor === filtroSaldoConta);
      if (faixa && (c.saldoConta < faixa.min || c.saldoConta >= faixa.max)) return false;
    }
    return true;
  });

  const contadores = {
    A: clientes.filter((c) => c.classificacao === "A").length,
    B: clientes.filter((c) => c.classificacao === "B").length,
    C: clientes.filter((c) => c.classificacao === "C").length,
  };

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const atualizarClasse = async (id: string, novaClasse: string) => {
    const res = await fetch(`/api/backoffice/clientes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classificacao: novaClasse, classificacaoManual: true }),
    });
    if (res.ok) {
      setClientes((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, classificacao: novaClasse, classificacaoManual: true } : c
        )
      );
      setEditando(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Contadores por classe */}
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
            <p className="text-xs font-medium">{classLegenda[classe]}</p>
          </button>
        ))}
      </div>

      {/* Busca + filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        {/* Filtro por faixa de saldo em conta */}
        <select
          value={filtroSaldoConta}
          onChange={(e) => setFiltroSaldoConta(e.target.value as FaixaSaldo)}
          className="px-3 py-2 rounded-lg border bg-background text-sm"
          title="Filtrar por saldo em conta corrente"
        >
          {FAIXAS_SALDO.map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.label}
            </option>
          ))}
        </select>

        {(filtroClasse !== "todos" || filtroSaldoConta !== "todos") && (
          <button
            onClick={() => { setFiltroClasse("todos"); setFiltroSaldoConta("todos"); }}
            className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          >
            Limpar filtros <X className="h-3 w-3" />
          </button>
        )}

        <button
          onClick={buscarUltimosContatos}
          disabled={buscandoContatos}
          className="px-3 py-2 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400 text-sm flex items-center gap-2 hover:bg-violet-500/20 disabled:opacity-50"
          title="Mostrar últimos contatos na tabela (não persiste — só visualização)"
        >
          {buscandoContatos ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="h-4 w-4" />
          )}
          {buscandoContatos ? "Buscando..." : "Buscar contatos"}
        </button>

        {isAdmin && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) importarPlanilha(file);
              }}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importandoPlanilha || !xlsxReady}
              className="px-3 py-2 rounded-lg border border-primary/40 bg-primary/10 text-primary text-sm flex items-center gap-2 hover:bg-primary/20 disabled:opacity-50"
              title="Importar planilha (.xlsx/.csv): atualiza existentes por conta/CPF/nome e cadastra novos sem duplicar"
            >
              {importandoPlanilha ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {importandoPlanilha ? "Importando..." : "Importar planilha"}
            </button>

            <button
              onClick={exportarPlanilha}
              disabled={exportando || !xlsxReady}
              className="px-3 py-2 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-400 text-sm flex items-center gap-2 hover:bg-teal-500/20 disabled:opacity-50"
              title="Exportar todos os clientes em .xlsx (formato compatível com a importação)"
            >
              {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {exportando ? "Exportando..." : "Exportar planilha"}
            </button>

            <button
              onClick={sincronizarDatacrazy}
              disabled={syncDatacrazy}
              className="px-3 py-2 rounded-lg border border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 text-sm flex items-center gap-2 hover:bg-fuchsia-500/20 disabled:opacity-50"
              title="Sincronizar último contato (Datacrazy WhatsApp) e última reunião (Plaud) PERSISTINDO no banco"
            >
              {syncDatacrazy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
              {syncDatacrazy ? "Sincronizando..." : "Sync Datacrazy"}
            </button>

            <button
              onClick={sincronizarOutlook}
              disabled={syncOutlook}
              className="px-3 py-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 text-sm flex items-center gap-2 hover:bg-indigo-500/20 disabled:opacity-50"
              title="Sincronizar próximas reuniões agendadas no Outlook (calendário publicado via ICS)"
            >
              {syncOutlook ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              {syncOutlook ? "Lendo Outlook..." : "Sync Outlook"}
            </button>

            <button
              onClick={sincronizarBtg}
              disabled={sincronizando}
              className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-2 hover:bg-emerald-500/20 disabled:opacity-50"
              title="Buscar saldos atualizados via BTG Partner API"
            >
              <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} />
              {sincronizando ? "Sincronizando..." : "Sincronizar saldos BTG"}
            </button>

            <button
              onClick={importarBtg}
              disabled={importando}
              className="px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400 text-sm flex items-center gap-2 hover:bg-sky-500/20 disabled:opacity-50"
              title="Importar todos os clientes do BTG (Base de Contas + Cadastrais + Saldo + Posição)"
            >
              {importando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {importando ? "Importando..." : "Importar do BTG"}
            </button>

            <button
              onClick={enriquecerBtg}
              disabled={enriquecendo}
              className="px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2 hover:bg-amber-500/20 disabled:opacity-50"
              title="Enriquecer com Suitability + Assessor + Receita do BTG"
            >
              {enriquecendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {enriquecendo ? "Enriquecendo..." : "Enriquecer dados"}
            </button>

            <button
              onClick={sincronizarMovimentacoes}
              disabled={sincMovs}
              className="px-3 py-2 rounded-lg border border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 text-sm flex items-center gap-2 hover:bg-zinc-500/20 disabled:opacity-50"
              title="Sincronizar movimentações dos últimos 7 dias"
            >
              {sincMovs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
              {sincMovs ? "Sincronizando..." : "Sync Movimentações"}
            </button>
          </>
        )}
      </div>

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

      {/* Tabela */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">
            Clientes ({filtrados.length}
            {filtrados.length !== clientes.length && ` de ${clientes.length}`})
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Classe</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Conta</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">AUM</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Saldo Conta</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Receita/ano</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Último contato</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Última reunião</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Próxima reunião</th>
                {contatosCarregados && (
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contatos recentes</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtrados.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
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
                        <button
                          onClick={() => setEditando(null)}
                          className="ml-1 text-muted-foreground"
                        >
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
                        {c.classificacaoManual && <Check className="h-3 w-3" />}
                        {!c.classificacaoManual && <Edit2 className="h-3 w-3 opacity-50" />}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/backoffice/clientes/${c.id}`}
                      className="hover:underline hover:text-primary"
                    >
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {c.numeroConta}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{moeda(c.saldo)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {c.saldoConta > 0 ? (
                      <span className="text-emerald-700 dark:text-emerald-400">{moeda(c.saldoConta)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {moeda(c.receitaAnual)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.ultimoContatoAt
                      ? new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.ultimaReuniaoAt
                      ? new Date(c.ultimaReuniaoAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.proximaReuniaoAt ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                        {new Date(c.proximaReuniaoAt).toLocaleDateString("pt-BR")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {contatosCarregados && (
                    <td className="px-4 py-3">
                      <ContatosBadges contatos={contatos[c.id] || []} />
                    </td>
                  )}
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={contatosCarregados ? 10 : 9} className="px-4 py-8 text-center text-muted-foreground">
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
          <div
            key={i}
            className="flex items-center gap-1.5 text-xs group relative"
            title={c.resumo}
          >
            <Icone className={`h-3.5 w-3.5 flex-shrink-0 ${cor}`} />
            <span className="text-muted-foreground">{dataFormatada}</span>
            <span className="truncate max-w-[120px] text-foreground/70">{c.resumo.substring(0, 40)}</span>
          </div>
        );
      })}
    </div>
  );
}
