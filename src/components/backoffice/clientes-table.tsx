"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Search, Edit2, Check, X } from "lucide-react";

interface Cliente {
  id: string;
  nome: string;
  numeroConta: string;
  saldo: number;
  classificacao: string;
  classificacaoManual: boolean;
  email: string | null;
  telefone: string | null;
  profissao: string | null;
  nicho: string | null;
  ultimoContatoAt: Date | string | null;
  proximoContatoAt: Date | string | null;
  receitaAnual: number;
}

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

export function ClientesTable({ clientes: iniciais }: { clientes: Cliente[] }) {
  const [clientes, setClientes] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtroClasse, setFiltroClasse] = useState<"todos" | "A" | "B" | "C">("todos");
  const [editando, setEditando] = useState<string | null>(null);

  const filtrados = clientes.filter((c) => {
    if (filtroClasse !== "todos" && c.classificacao !== filtroClasse) return false;
    if (busca && !c.nome.toLowerCase().includes(busca.toLowerCase())) return false;
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
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>
        {filtroClasse !== "todos" && (
          <button
            onClick={() => setFiltroClasse("todos")}
            className="px-3 py-2 rounded-lg border text-sm flex items-center gap-2"
          >
            Limpar filtro <X className="h-3 w-3" />
          </button>
        )}
      </div>

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
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Receita/ano</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Último contato</th>
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
                  <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                    {moeda(c.receitaAnual)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.ultimoContatoAt
                      ? new Date(c.ultimoContatoAt).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
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
