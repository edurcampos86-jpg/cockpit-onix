"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { TemplateList } from "@/components/roteiros/template-list";
import { ScriptList } from "@/components/roteiros/script-list";
import { ScriptEditor } from "@/components/roteiros/script-editor";
import { Plus, Search } from "lucide-react";
import type { PostCategory } from "@/lib/types";

export interface ScriptData {
  id: string;
  title: string;
  category: string;
  hook: string | null;
  body: string;
  cta: string | null;
  ctaType: string | null;
  estimatedTime: string | null;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  author: { name: string };
  post?: { id: string; title: string; scheduledDate: string; format: string } | null;
}

export default function RoteirosPage() {
  const [templates, setTemplates] = useState<ScriptData[]>([]);
  const [scripts, setScripts] = useState<ScriptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<PostCategory | "todos">("todos");
  const [editingScript, setEditingScript] = useState<ScriptData | null>(null);
  const [creatingFrom, setCreatingFrom] = useState<ScriptData | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const categoryParam = filterCategory !== "todos" ? `&category=${filterCategory}` : "";

      const [templatesRes, scriptsRes] = await Promise.all([
        fetch("/api/scripts?templates=true"),
        fetch(`/api/scripts?templates=false${searchParam}${categoryParam}`),
      ]);

      setTemplates(await templatesRes.json());
      setScripts(await scriptsRes.json());
    } catch (error) {
      console.error("Error fetching scripts:", error);
    } finally {
      setLoading(false);
    }
  }, [search, filterCategory]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNewScript = () => {
    setEditingScript(null);
    setCreatingFrom(null);
    setShowEditor(true);
  };

  const handleUseTemplate = (template: ScriptData) => {
    setEditingScript(null);
    setCreatingFrom(template);
    setShowEditor(true);
  };

  const handleEditScript = (script: ScriptData) => {
    setEditingScript(script);
    setCreatingFrom(null);
    setShowEditor(true);
  };

  const handleDuplicate = (script: ScriptData) => {
    setEditingScript(null);
    setCreatingFrom({ ...script, title: `${script.title} (cópia)` });
    setShowEditor(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/scripts/${id}`, { method: "DELETE" });
      fetchData();
    } catch (error) {
      console.error("Error deleting script:", error);
    }
  };

  const handleSaved = () => {
    setShowEditor(false);
    setEditingScript(null);
    setCreatingFrom(null);
    fetchData();
  };

  if (showEditor) {
    return (
      <ScriptEditor
        script={editingScript}
        template={creatingFrom}
        onSave={handleSaved}
        onCancel={() => {
          setShowEditor(false);
          setEditingScript(null);
          setCreatingFrom(null);
        }}
      />
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <PageHeader
          title="Roteiros"
          description="Templates e roteiros para seus conteúdos"
        />
        <button
          onClick={handleNewScript}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm self-start"
        >
          <Plus className="h-4 w-4" />
          Novo Roteiro
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar roteiros por título, gancho ou conteúdo..."
            className="w-full pl-10 pr-4 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as PostCategory | "todos")}
          className="px-3 py-2 text-sm rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="todos">Todas as categorias</option>
          <option value="pergunta_semana">Pergunta da Semana</option>
          <option value="onix_pratica">Onix na Prática</option>
          <option value="patrimonio_mimimi">Patrimônio sem Mimimi</option>
          <option value="alerta_patrimonial">Alerta Patrimonial</option>
          <option value="sabado_bastidores">Sábado de Bastidores</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
          Carregando roteiros...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Templates */}
          <div className="lg:col-span-4">
            <TemplateList templates={templates} onUseTemplate={handleUseTemplate} />
          </div>

          {/* Scripts */}
          <div className="lg:col-span-8">
            <ScriptList
              scripts={scripts}
              onEdit={handleEditScript}
              onDuplicate={handleDuplicate}
              onDelete={handleDelete}
            />
          </div>
        </div>
      )}
    </div>
  );
}
