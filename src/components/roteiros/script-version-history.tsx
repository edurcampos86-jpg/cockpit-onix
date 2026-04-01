"use client";

import { useState, useEffect, useCallback } from "react";
import { History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ScriptVersionData {
  id: string;
  title: string;
  hook: string | null;
  body: string;
  cta: string | null;
  ctaType: string | null;
  changeReason: string;
  createdAt: string;
}

interface ScriptVersionHistoryProps {
  scriptId: string;
  onRestored?: () => void;
  compact?: boolean;
}

export function ScriptVersionHistory({ scriptId, onRestored, compact = false }: ScriptVersionHistoryProps) {
  const [versions, setVersions] = useState<ScriptVersionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/scripts/${scriptId}/versions`);
      const data = await res.json();
      setVersions(data);
    } catch {
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    if (expanded) fetchVersions();
  }, [expanded, fetchVersions]);

  const handleRestore = async (versionId: string) => {
    setRestoring(versionId);
    try {
      await fetch(`/api/scripts/${scriptId}/versions/${versionId}/restore`, { method: "POST" });
      if (onRestored) onRestored();
    } catch {
      // silently fail
    } finally {
      setRestoring(null);
    }
  };

  return (
    <div className={`border border-border rounded-lg overflow-hidden ${compact ? "" : "mt-4"}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-accent/30 hover:bg-accent/50 transition-colors text-sm"
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          <span className="font-medium">Historico de Versoes</span>
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="max-h-60 overflow-y-auto">
          {loading ? (
            <p className="p-3 text-xs text-muted-foreground">Carregando...</p>
          ) : versions.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Nenhuma versao anterior</p>
          ) : (
            <div className="divide-y divide-border">
              {versions.map((v) => (
                <div key={v.id} className="p-3 hover:bg-accent/20 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(v.createdAt), { locale: ptBR, addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                        {v.changeReason}
                      </span>
                      <button
                        onClick={() => handleRestore(v.id)}
                        disabled={restoring === v.id}
                        className="flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-50"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {restoring === v.id ? "..." : "Restaurar"}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-foreground truncate">{v.title}</p>
                  {v.hook && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 italic">{v.hook}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
