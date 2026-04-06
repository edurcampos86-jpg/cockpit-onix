"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileSpreadsheet, Trash2, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    XLSX: any;
  }
}

interface Cliente {
  id: string;
  nome: string;
  numeroConta: string;
  saldo: number;
}

interface DadosUploadProps {
  initialClientes: Cliente[];
  initialTotal: number;
}

function mapRowToCliente(row: Record<string, unknown>) {
  const nome = String(
    row["nome"] ?? row["Nome"] ?? row["NOME"] ?? row["name"] ?? row["Name"] ?? ""
  ).trim();

  const numeroConta = String(
    row["numero_conta"] ?? row["numeroConta"] ?? row["Numero da Conta"] ??
    row["conta"] ?? row["Conta"] ?? row["CONTA"] ?? row["account"] ??
    row["numero conta"] ?? row["Número da Conta"] ?? row["N Conta"] ?? ""
  ).trim();

  const saldoRaw =
    row["saldo"] ?? row["Saldo"] ?? row["SALDO"] ?? row["balance"] ?? row["Balance"] ?? 0;
  const saldo = typeof saldoRaw === "number" ? saldoRaw : parseFloat(String(saldoRaw).replace(/[^\d.,-]/g, "").replace(",", ".")) || 0;

  return { nome, numeroConta, saldo };
}

export function DadosUpload({ initialClientes, initialTotal }: DadosUploadProps) {
  const [clientes, setClientes] = useState<Cliente[]>(initialClientes);
  const [total, setTotal] = useState(initialTotal);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [xlsxReady, setXlsxReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load xlsx from CDN
  useEffect(() => {
    if (window.XLSX) {
      setXlsxReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.onload = () => setXlsxReady(true);
    document.head.appendChild(script);
  }, []);

  const clearMessage = () => setTimeout(() => setMessage(null), 5000);

  const fetchClientes = useCallback(async () => {
    try {
      const res = await fetch("/api/backoffice/clientes");
      const data = await res.json();
      setClientes(data.clientes || []);
      setTotal(data.total || 0);
    } catch {
      // silent
    }
  }, []);

  const handleUpload = async (file: File) => {
    const validExtensions = [".xlsx", ".xls", ".csv"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(ext)) {
      setMessage({ type: "error", text: "Formato invalido. Use .xlsx, .xls ou .csv" });
      clearMessage();
      return;
    }

    if (!xlsxReady || !window.XLSX) {
      setMessage({ type: "error", text: "Biblioteca de leitura ainda carregando. Tente novamente." });
      clearMessage();
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // Parse Excel in the browser
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: Record<string, unknown>[] = window.XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        setMessage({ type: "error", text: "Planilha vazia" });
        clearMessage();
        setUploading(false);
        return;
      }

      const parsedClientes = rows.map(mapRowToCliente).filter((c) => c.nome.length > 0);

      if (parsedClientes.length === 0) {
        setMessage({ type: "error", text: "Nenhum cliente valido. Verifique se a planilha tem coluna 'nome'." });
        clearMessage();
        setUploading(false);
        return;
      }

      // Send parsed data as JSON
      const res = await fetch("/api/backoffice/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientes: parsedClientes }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Erro ao importar" });
        clearMessage();
        return;
      }

      setMessage({ type: "success", text: data.message });
      clearMessage();
      await fetchClientes();
    } catch {
      setMessage({ type: "error", text: "Erro ao processar arquivo. Verifique o formato." });
      clearMessage();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja remover todos os dados de clientes?")) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/backoffice/clientes", { method: "DELETE" });
      if (res.ok) {
        setClientes([]);
        setTotal(0);
        setMessage({ type: "success", text: "Dados removidos com sucesso" });
        clearMessage();
      }
    } catch {
      setMessage({ type: "error", text: "Erro ao remover dados" });
      clearMessage();
    } finally {
      setDeleting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Dados de Clientes</h3>
              <p className="text-sm text-muted-foreground">
                {total > 0 ? `${total} clientes cadastrados` : "Nenhum dado importado"}
              </p>
            </div>
          </div>
          {total > 0 && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Limpar dados
            </button>
          )}
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
            ${dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/50"
            }
            ${uploading ? "pointer-events-none opacity-60" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onFileSelect}
            className="hidden"
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm font-medium">Importando dados...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">
                  Arraste um arquivo Excel aqui ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Formatos aceitos: .xlsx, .xls, .csv
                </p>
                <p className="text-xs text-muted-foreground">
                  Colunas esperadas: nome, numero_conta (ou conta), saldo
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        {message && (
          <div
            className={`flex items-center gap-2 mt-4 p-3 rounded-lg text-sm ${
              message.type === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            {message.text}
          </div>
        )}
      </div>

      {/* Data table */}
      {clientes.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold">Clientes Importados ({total})</h3>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left px-6 py-3 font-medium text-muted-foreground">Conta</th>
                  <th className="text-right px-6 py-3 font-medium text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {clientes.map((cliente, i) => (
                  <tr key={cliente.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 text-muted-foreground">{i + 1}</td>
                    <td className="px-6 py-3 font-medium">{cliente.nome}</td>
                    <td className="px-6 py-3 text-muted-foreground">{cliente.numeroConta}</td>
                    <td className="px-6 py-3 text-right font-mono">
                      {formatCurrency(cliente.saldo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
