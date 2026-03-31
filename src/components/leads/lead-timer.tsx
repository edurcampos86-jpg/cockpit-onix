"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Clock, AlertTriangle } from "lucide-react";

interface LeadTimerProps {
  lastContactAt: string | null;
  enteredAt: string;
  temperature: string;
  isActive?: boolean; // se o lead ainda precisa de resposta (não é cliente_ativo)
}

// Limites de SLA em minutos por temperatura
const SLA_LIMITS: Record<string, number> = {
  quente: 5,
  morno: 30,
  frio: 120,
};

function formatElapsed(diffMin: number): string {
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export function LeadTimer({ lastContactAt, enteredAt, temperature, isActive = true }: LeadTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) return;

    const refDate = lastContactAt ? new Date(lastContactAt) : new Date(enteredAt);

    const update = () => {
      const diffMs = Date.now() - refDate.getTime();
      setElapsed(Math.floor(diffMs / 60000));
    };

    update();
    const interval = setInterval(update, 30000); // atualiza a cada 30s
    return () => clearInterval(interval);
  }, [lastContactAt, enteredAt, isActive]);

  if (!isActive) {
    return (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Clock className="h-2.5 w-2.5" />
        {formatElapsed(elapsed)}
      </span>
    );
  }

  const limit = SLA_LIMITS[temperature] || 120;
  const ratio = elapsed / limit;

  // Cor progressiva: verde → amarelo → vermelho
  const colorClass =
    ratio < 0.5
      ? "text-emerald-400"
      : ratio < 1
        ? "text-amber-400"
        : "text-red-400";

  const bgClass =
    ratio < 0.5
      ? "bg-emerald-400"
      : ratio < 1
        ? "bg-amber-400"
        : "bg-red-400";

  const isLate = ratio >= 1;

  return (
    <div className="space-y-1">
      <span className={cn("flex items-center gap-1 text-[11px] font-medium", colorClass)}>
        {isLate ? <AlertTriangle className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
        {formatElapsed(elapsed)}
        {isLate && (
          <span className="text-[9px] opacity-75">
            (SLA: {limit < 60 ? `${limit}min` : `${limit / 60}h`})
          </span>
        )}
      </span>
      {/* Mini progress bar de SLA */}
      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", bgClass)}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
