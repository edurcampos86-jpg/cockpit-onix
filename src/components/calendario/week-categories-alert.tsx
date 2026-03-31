"use client";

import { useMemo } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";

const REQUIRED_CATEGORIES: PostCategory[] = [
  "pergunta_semana",
  "onix_pratica",
  "patrimonio_mimimi",
  "alerta_patrimonial",
  "sabado_bastidores",
];

interface WeekCategoriesAlertProps {
  posts: { category: string }[];
  compact?: boolean;
}

export function WeekCategoriesAlert({ posts, compact = false }: WeekCategoriesAlertProps) {
  const { missing, present, allPresent } = useMemo(() => {
    const presentSet = new Set(posts.map((p) => p.category));
    const missingCategories = REQUIRED_CATEGORIES.filter((c) => !presentSet.has(c));
    const presentCategories = REQUIRED_CATEGORIES.filter((c) => presentSet.has(c));
    return {
      missing: missingCategories,
      present: presentCategories,
      allPresent: missingCategories.length === 0,
    };
  }, [posts]);

  if (compact) {
    // Versão compacta para o dashboard
    return (
      <div className={`rounded-xl border p-4 ${
        allPresent
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-amber-500/5 border-amber-500/20"
      }`}>
        <div className="flex items-center gap-2 mb-2">
          {allPresent ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          )}
          <span className={`text-xs font-semibold ${allPresent ? "text-emerald-400" : "text-amber-400"}`}>
            Quadros Fixos: {present.length}/{REQUIRED_CATEGORIES.length}
          </span>
        </div>
        {!allPresent && (
          <div className="flex flex-wrap gap-1">
            {missing.map((cat) => (
              <span
                key={cat}
                className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                {CATEGORY_LABELS[cat]}
              </span>
            ))}
          </div>
        )}
        {allPresent && (
          <p className="text-[11px] text-emerald-400">Todos os quadros fixos planejados!</p>
        )}
      </div>
    );
  }

  // Versão completa para o calendário
  return (
    <div className={`rounded-xl border p-4 ${
      allPresent
        ? "bg-emerald-500/5 border-emerald-500/20"
        : "bg-amber-500/5 border-amber-500/20"
    }`}>
      <div className="flex items-center gap-2 mb-3">
        {allPresent ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        )}
        <h3 className={`text-sm font-semibold ${allPresent ? "text-emerald-400" : "text-amber-400"}`}>
          {allPresent ? "Semana completa!" : "Quadros fixos faltando"}
        </h3>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {REQUIRED_CATEGORIES.map((cat) => {
          const isPresent = present.includes(cat);
          return (
            <div
              key={cat}
              className={`text-center p-2 rounded-lg border ${
                isPresent
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-red-500/10 border-red-500/20"
              }`}
            >
              <div className="mb-1">
                {isPresent ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-red-400 mx-auto" />
                )}
              </div>
              <p className={`text-[10px] font-medium leading-tight ${
                isPresent ? "text-emerald-400" : "text-red-400"
              }`}>
                {CATEGORY_LABELS[cat]}
              </p>
            </div>
          );
        })}
      </div>

      {!allPresent && (
        <p className="text-xs text-muted-foreground mt-3">
          Faltam {missing.length} quadro{missing.length > 1 ? "s" : ""} fixo{missing.length > 1 ? "s" : ""} para completar a semana.
          Crie posts para: {missing.map((c) => CATEGORY_LABELS[c]).join(", ")}.
        </p>
      )}
    </div>
  );
}
