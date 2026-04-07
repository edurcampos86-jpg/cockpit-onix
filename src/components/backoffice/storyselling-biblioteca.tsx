"use client";

import { useState } from "react";
import { BookOpen, Plus, Search, Trash2, Tag } from "lucide-react";

interface Historia {
  id: string;
  titulo: string;
  categoria: string;
  analogia: string;
  quandoUsar: string | null;
  tags: string | null;
}

const CATEGORIAS = [
  { id: "aposentadoria", label: "Aposentadoria", cor: "bg-blue-100 text-blue-900 border-blue-300" },
  { id: "sucessao", label: "Sucessão", cor: "bg-purple-100 text-purple-900 border-purple-300" },
  { id: "risco", label: "Risco", cor: "bg-red-100 text-red-900 border-red-300" },
  { id: "diversificacao", label: "Diversificação", cor: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  { id: "inflacao", label: "Inflação", cor: "bg-orange-100 text-orange-900 border-orange-300" },
  { id: "disciplina", label: "Disciplina", cor: "bg-amber-100 text-amber-900 border-amber-300" },
  { id: "outro", label: "Outro", cor: "bg-zinc-100 text-zinc-900 border-zinc-300" },
];

export function StorysellingBiblioteca({ historias: iniciais }: { historias: Historia[] }) {
  const [historias, setHistorias] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState<string>("todos");
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    categoria: "outro",
    analogia: "",
    quandoUsar: "",
    tags: "",
  });

  const filtradas = historias.filter((h) => {
    if (filtroCat !== "todos" && h.categoria !== filtroCat) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return (
        h.titulo.toLowerCase().includes(q) ||
        h.analogia.toLowerCase().includes(q) ||
        (h.tags?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const criar = async () => {
    if (!form.titulo.trim() || !form.analogia.trim()) return;
    const res = await fetch("/api/backoffice/storyselling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const nova = await res.json();
      setHistorias([nova, ...historias]);
      setForm({ titulo: "", categoria: "outro", analogia: "", quandoUsar: "", tags: "" });
      setCriando(false);
    }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover esta história?")) return;
    const res = await fetch(`/api/backoffice/storyselling/${id}`, { method: "DELETE" });
    if (res.ok) setHistorias(historias.filter((h) => h.id !== id));
  };

  const corDe = (cat: string) => CATEGORIAS.find((c) => c.id === cat)?.cor ?? CATEGORIAS[6].cor;

  return (
    <div className="space-y-4">
      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFiltroCat("todos")}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
            filtroCat === "todos" ? "bg-primary text-primary-foreground border-primary" : "border-border"
          }`}
        >
          Todas ({historias.length})
        </button>
        {CATEGORIAS.map((c) => {
          const n = historias.filter((h) => h.categoria === c.id).length;
          if (n === 0) return null;
          return (
            <button
              key={c.id}
              onClick={() => setFiltroCat(filtroCat === c.id ? "todos" : c.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                filtroCat === c.id ? c.cor : "border-border"
              }`}
            >
              {c.label} ({n})
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, conteúdo ou tag..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
          />
        </div>
        <button
          onClick={() => setCriando(!criando)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Nova história
        </button>
      </div>

      {criando && (
        <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
          <input
            type="text"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            placeholder="Título (ex: A árvore que cresce — juros compostos)"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-semibold"
          />
          <select
            value={form.categoria}
            onChange={(e) => setForm({ ...form, categoria: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          >
            {CATEGORIAS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <textarea
            value={form.analogia}
            onChange={(e) => setForm({ ...form, analogia: e.target.value })}
            placeholder="A analogia / história em si..."
            rows={4}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <textarea
            value={form.quandoUsar}
            onChange={(e) => setForm({ ...form, quandoUsar: e.target.value })}
            placeholder="Quando usar (contexto, perfil de cliente)..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <input
            type="text"
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
            placeholder="Tags separadas por vírgula"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={criar}
              disabled={!form.titulo.trim() || !form.analogia.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Salvar história
            </button>
            <button onClick={() => setCriando(false)} className="px-4 py-2 rounded-lg border text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Cards de histórias */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtradas.map((h) => (
          <div key={h.id} className={`rounded-xl border-2 p-4 ${corDe(h.categoria)}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-start gap-2">
                <BookOpen className="h-5 w-5 mt-0.5 shrink-0" />
                <h4 className="font-bold text-sm">{h.titulo}</h4>
              </div>
              <button onClick={() => remover(h.id)} className="opacity-50 hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs whitespace-pre-wrap leading-relaxed mb-2">{h.analogia}</p>
            {h.quandoUsar && (
              <div className="mt-2 pt-2 border-t border-current/20">
                <p className="text-[10px] uppercase font-semibold opacity-70 mb-0.5">Quando usar</p>
                <p className="text-xs opacity-90">{h.quandoUsar}</p>
              </div>
            )}
            {h.tags && (
              <div className="mt-2 flex items-center gap-1 flex-wrap">
                <Tag className="h-3 w-3 opacity-60" />
                {h.tags.split(",").map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 bg-white/40 dark:bg-black/20 rounded">
                    {t.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filtradas.length === 0 && (
          <div className="md:col-span-2 text-center py-12 text-sm text-muted-foreground">
            {historias.length === 0
              ? "Biblioteca vazia. Clique em \"Nova história\" para começar a montar seu arsenal de Storyselling."
              : "Nenhuma história encontrada com os filtros atuais."}
          </div>
        )}
      </div>
    </div>
  );
}
