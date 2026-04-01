"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface CtaWeeklyAlertProps {
  totalPosts: number;
  explicitCtaCount: number;
}

export function CtaWeeklyAlert({ totalPosts, explicitCtaCount }: CtaWeeklyAlertProps) {
  if (totalPosts === 0) return null;

  const maxAllowed = Math.max(1, Math.floor(totalPosts * 0.2));
  const isOverLimit = explicitCtaCount > maxAllowed;
  const percentage = Math.round((explicitCtaCount / totalPosts) * 100);

  if (!isOverLimit && explicitCtaCount === 0) return null;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        isOverLimit
          ? "bg-red-500/5 border-red-500/20"
          : "bg-emerald-500/5 border-emerald-500/20"
      }`}
    >
      {isOverLimit ? (
        <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
      )}
      <div className="flex-1">
        <p className={`text-sm font-medium ${isOverLimit ? "text-red-400" : "text-emerald-400"}`}>
          Regra 80/20: {explicitCtaCount}/{totalPosts} posts com CTA Explícito ({percentage}%)
        </p>
        <p className="text-xs text-muted-foreground">
          {isOverLimit
            ? `Limite semanal excedido. Máximo recomendado: ${maxAllowed} CTA${maxAllowed > 1 ? "s" : ""} explícito${maxAllowed > 1 ? "s" : ""} para ${totalPosts} posts (20%).`
            : `Dentro do limite. Máximo: ${maxAllowed} CTA${maxAllowed > 1 ? "s" : ""} explícito${maxAllowed > 1 ? "s" : ""} esta semana.`}
        </p>
      </div>
    </div>
  );
}
