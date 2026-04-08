"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2, TrendingUp, RefreshCw, Filter } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    XLSX: any;
  }
}

interface Group { label: string; faturamento: number; liquido: number; count: number }
interface MesItem { mes: string; faturamento: number; liquido: number }
interface Sumario {
  total: number;
  faturamentoTotal: number;
  liquidoTotal: number;
  porParceiro: Group[];
  porProduto: Group[];
  porCliente: Group[];
  porMes: MesItem[];
  filtros?: { clientes: string[]; assessores: string[]; anos: number[] };
}

const CHAVES = {
  data: ["Data", "data", "DATA", "Date"],
  faturamento: ["Faturamento", "faturamento", "FATURAMENTO"],
  imposto: ["Imposto", "imposto", "IMPOSTO"],
  liquido: ["Fat. Liquido", "Fat Liquido", "fat_liquido", "Faturamento Liquido", "Faturamento Líquido"],
  assessor: ["Assessor", "assessor"],
  parceiro: ["Parceiro", "parceiro", "PARCEIRO"],
  departamento: ["Departamento", "departamento"],
  classificacao: ["Classificação", "Classificacao", "classificacao"],
  categoria: ["Categoria", "categoria"],
  produto: ["Produto", "produto", "PRODUTO"],
  cliente: ["nm_Cliente", "Cliente", "cliente", "Nome Cliente", "nomeCliente", "NM_CLIENTE"],
};

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (row[k] != null) return row[k];
  return null;
};

const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export function ReceitaUpload() {
  const [sumario, setSumario] = useState<Sumario | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [fCliente, setFCliente] = useState("");
  const [fAssessor, setFAssessor] = useState("");
  const [fAno, setFAno] = useState("");
  const [fPeriodo, setFPeriodo] = useState(""); // "" | "Q1".."Q4" | "M1".."M12"
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.XLSX) { setXlsxReady(true); return; }
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => setXlsxReady(true);
    document.head.appendChild(s);
  }, []);

  const clear = () => setTimeout(() => setMsg(null), 6000);

  const fetchSumario = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (fCliente) qs.set("cliente", fCliente);
      if (fAssessor) qs.set("assessor", fAssessor);
      if (fAno) qs.set("ano", fAno);
      if (fPeriodo.startsWith("Q")) qs.set("trimestre", fPeriodo.slice(1));
      else if (fPeriodo.startsWith("M")) qs.set("mes", fPeriodo.slice(1));
      const r = await fetch("/api/backoffice/receita?" + qs.toString());
      if (r.ok) setSumario(await r.json());
    } catch { /* noop */ }
  }, [fCliente, fAssessor, fAno, fPeriodo]);

  useEffect(() => { fetchSumario(); }, [fetchSumario]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const r = await fetch("/api/backoffice/receita", { method: "PATCH" });
      const d = await r.json();
      if (r.ok) setMsg({ type: "success", text: `Receita atualizada em ${d.atualizados}/${d.total} clientes` });
      else setMsg({ type: "error", text: d.error || "Erro" });
      clear();
    } finally {
      setSyncing(false);
    }
  };

  const handleUpload = async (file: File, replace: boolean) => {
    if (!xlsxReady || !window.XLSX) {
      setMsg({ type: "error", text: "Biblioteca de leitura ainda carregando." });
      clear();
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = window.XLSX.read(buf, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows: Record<string, unknown>[] = window.XLSX.utils.sheet_to_json(sheet, { defval: null });
      if (!rawRows.length) {
        setMsg({ type: "error", text: "Planilha vazia" });
        clear();
        setUploading(false);
        return;
      }

      const rows = rawRows.map((row) => ({
        data: pick(row, CHAVES.data),
        faturamento: pick(row, CHAVES.faturamento),
        imposto: pick(row, CHAVES.imposto),
        faturamentoLiquido: pick(row, CHAVES.liquido),
        assessor: pick(row, CHAVES.assessor),
        parceiro: pick(row, CHAVES.parceiro),
        departamento: pick(row, CHAVES.departamento),
        classificacao: pick(row, CHAVES.classificacao),
        categoria: pick(row, CHAVES.categoria),
        produto: pick(row, CHAVES.produto),
        nomeCliente: pick(row, CHAVES.cliente),
      }));

      void replace;
      const res = await fetch("/api/backoffice/receita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: data.error || "Erro ao importar" });
        clear();
        return;
      }
      setMsg({ type: "success", text: data.message });
      clear();
      await fetchSumario();
    } catch (e) {
      setMsg({ type: "error", text: e instanceof Error ? e.message : "Erro ao processar" });
      clear();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover TODOS os lançamentos de receita importados?")) return;
    setDeleting(true);
    try {
      const r = await fetch("/api/backoffice/receita", { method: "DELETE" });
      if (r.ok) {
        setMsg({ type: "success", text: "Dados removidos" });
        clear();
        await fetchSumario();
      }
    } finally {
      setDeleting(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f, true); // sempre substitui ao importar via clique
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleUpload(f, true);
  };

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Relatório de Receita</h3>
              <p className="text-sm text-muted-foreground">
                {sumario?.total ? `${sumario.total} lançamentos · ${moeda(sumario.liquidoTotal)} líquido` : "Nenhum dado importado"}
              </p>
            </div>
          </div>
          {sumario && sumario.total > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border hover:bg-muted disabled:opacity-50"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar receita dos clientes
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Limpar dados
              </button>
            </div>
          )}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} className="hidden" />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm font-medium">Importando lançamentos...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Arraste o relatório de receita aqui ou clique para selecionar</p>
                <p className="text-xs text-muted-foreground mt-1">Formatos aceitos: .xlsx, .xls, .csv</p>
                <p className="text-xs text-muted-foreground">
                  Colunas esperadas: Data, Faturamento, Imposto, Fat. Liquido, Assessor, Parceiro, Departamento, Classificação, Categoria, Produto, nm_Cliente
                </p>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-2">
                  ✓ Importação incremental — duplicatas (mesma data, valores, parceiro, produto e cliente) são detectadas e ignoradas automaticamente
                </p>
              </div>
            </div>
          )}
        </div>

        {msg && (
          <div
            className={`flex items-center gap-2 mt-4 p-3 rounded-lg text-sm ${
              msg.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {msg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>

      {/* Filtros */}
      {sumario && sumario.filtros && (sumario.filtros.clientes.length > 0 || sumario.filtros.assessores.length > 0) && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <Filter className="h-4 w-4" /> Filtros
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="px-3 py-2 text-sm rounded-lg border bg-background">
              <option value="">Todos os clientes</option>
              {sumario.filtros.clientes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={fAssessor} onChange={(e) => setFAssessor(e.target.value)} className="px-3 py-2 text-sm rounded-lg border bg-background">
              <option value="">Todos os assessores</option>
              {sumario.filtros.assessores.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fAno} onChange={(e) => setFAno(e.target.value)} className="px-3 py-2 text-sm rounded-lg border bg-background">
              <option value="">Todos os anos</option>
              {sumario.filtros.anos.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={fPeriodo} onChange={(e) => setFPeriodo(e.target.value)} disabled={!fAno} className="px-3 py-2 text-sm rounded-lg border bg-background disabled:opacity-50">
              <option value="">Ano inteiro</option>
              <optgroup label="Trimestre">
                <option value="Q1">1º Trimestre</option>
                <option value="Q2">2º Trimestre</option>
                <option value="Q3">3º Trimestre</option>
                <option value="Q4">4º Trimestre</option>
              </optgroup>
              <optgroup label="Mês">
                {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m, i) => (
                  <option key={m} value={`M${i + 1}`}>{m}</option>
                ))}
              </optgroup>
            </select>
          </div>
          {(fCliente || fAssessor || fAno || fPeriodo) && (
            <button
              onClick={() => { setFCliente(""); setFAssessor(""); setFAno(""); setFPeriodo(""); }}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* KPIs */}
      {sumario && sumario.total > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Lançamentos</p>
              <p className="text-3xl font-bold mt-1">{sumario.total.toLocaleString("pt-BR")}</p>
            </div>
            <div className="rounded-xl border bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Faturamento bruto</p>
              <p className="text-2xl font-bold mt-1">{moeda(sumario.faturamentoTotal)}</p>
            </div>
            <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 p-5">
              <p className="text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Faturamento líquido
              </p>
              <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
                {moeda(sumario.liquidoTotal)}
              </p>
            </div>
          </div>

          {/* Por mês */}
          {sumario.porMes.length > 0 && (
            <div className="rounded-xl border bg-card p-5">
              <h4 className="font-semibold mb-4">Receita líquida por mês</h4>
              <div className="space-y-2">
                {(() => {
                  const max = Math.max(...sumario.porMes.map((m) => m.liquido));
                  return sumario.porMes.map((m) => (
                    <div key={m.mes} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-16 shrink-0">{m.mes}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${(m.liquido / max) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono w-32 text-right shrink-0">{moeda(m.liquido)}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Tabelas grupadas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GroupTable title="Top Parceiros" data={sumario.porParceiro} />
            <GroupTable title="Top Produtos" data={sumario.porProduto} />
            <GroupTable title="Top Clientes" data={sumario.porCliente} />
          </div>
        </>
      )}
    </div>
  );
}

function GroupTable({ title, data }: { title: string; data: Group[] }) {
  if (!data.length) return null;
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h4 className="font-semibold text-sm">{title}</h4>
      </div>
      <div className="overflow-y-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Item</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Líquido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((g, i) => (
              <tr key={g.label + i} className="hover:bg-muted/30">
                <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 font-medium truncate max-w-[200px]" title={g.label}>{g.label}</td>
                <td className="px-4 py-2 text-right font-mono text-xs">{moeda(g.liquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
