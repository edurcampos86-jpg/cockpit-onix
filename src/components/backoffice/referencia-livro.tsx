"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { useState } from "react";

interface Referencia {
  livro: string;
  autor: string;
  conceito: string;
  explicacao: string;
  citacao?: string;
}

interface Props {
  referencias: Referencia[];
  titulo?: string;
}

/**
 * Cartão educativo que exibe a fundamentação teórica de cada funcionalidade.
 * Cada recurso do backoffice é ancorado nos quatro livros de referência:
 *  - Marketing for Financial Advisors (Halloran)
 *  - Storyselling for Financial Advisors (West & Anthony)
 *  - Supernova Advisor Teams (Rob Knapp)
 *  - The Supernova Advisor (Rob Knapp)
 */
export function ReferenciaLivro({ referencias, titulo = "Fundamento teórico" }: Props) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
      <button
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <BookOpen className="h-4 w-4 text-amber-700 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{titulo}</p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {referencias.length} {referencias.length === 1 ? "referência" : "referências"} · clique para ver
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-amber-700 dark:text-amber-400 transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
        />
      </button>

      {aberto && (
        <div className="px-4 pb-4 space-y-3 border-t border-amber-200 dark:border-amber-900/50 pt-3">
          {referencias.map((r, i) => (
            <div
              key={i}
              className="rounded-lg bg-white dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 p-3"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {r.conceito}
                  </p>
                  <p className="text-xs italic text-amber-700 dark:text-amber-400">
                    {r.livro} — {r.autor}
                  </p>
                </div>
              </div>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
                {r.explicacao}
              </p>
              {r.citacao && (
                <blockquote className="mt-2 border-l-2 border-amber-400 pl-2 text-xs italic text-amber-800 dark:text-amber-300">
                  “{r.citacao}”
                </blockquote>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
