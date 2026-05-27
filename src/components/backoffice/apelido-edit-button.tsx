"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

interface Props {
  cliente: {
    id: string;
    numeroConta: string;
    apelido?: string | null;
    nome?: string | null;
    nomeCompleto?: string | null;
  };
  onSave: (novoApelido: string | null) => void;
}

/**
 * Botão inline pra editar o apelido do cliente direto da tabela.
 *
 * Estados:
 *   - Hidden por default; aparece ao hover na linha (via .group-hover do pai)
 *   - Click → input inline, Enter salva, Esc cancela
 *   - PATCH /api/backoffice/clientes/[id]/apelido devolve cliente atualizado
 *   - onSave recebe o NOVO apelido pra o pai atualizar o estado otimisticamente
 */
export function ApelidoEditButton({ cliente, onSave }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(cliente.apelido || "");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErro(null);
    const novoApelido = value.trim() || null;
    try {
      const res = await fetch(`/api/backoffice/clientes/${cliente.id}/apelido`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apelido: novoApelido }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onSave(novoApelido);
      setIsEditing(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsEditing(true);
        }}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-1 hover:bg-muted rounded"
        title={cliente.apelido ? `Apelido: ${cliente.apelido} (clique pra editar)` : "Definir apelido"}
      >
        <Pencil className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={cliente.nome?.split(" ")[0] || "Apelido"}
        maxLength={50}
        className="px-2 py-0.5 text-sm border rounded w-32 bg-background"
        autoFocus
        disabled={saving}
        onKeyDown={(e) => {
          if (e.key === "Enter") void handleSave();
          if (e.key === "Escape") {
            setIsEditing(false);
            setValue(cliente.apelido || "");
            setErro(null);
          }
        }}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="p-1 text-green-700 dark:text-green-400 hover:bg-green-500/10 rounded disabled:opacity-50"
        title="Salvar (Enter)"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setIsEditing(false);
          setValue(cliente.apelido || "");
          setErro(null);
        }}
        disabled={saving}
        className="p-1 text-red-700 dark:text-red-400 hover:bg-red-500/10 rounded disabled:opacity-50"
        title="Cancelar (Esc)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {erro && <span className="text-xs text-red-600 ml-1">{erro}</span>}
    </div>
  );
}
