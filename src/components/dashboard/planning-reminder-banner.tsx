"use client";

import { useState, useEffect } from "react";
import { Wand2, ArrowRight } from "lucide-react";
import Link from "next/link";

export function PlanningReminderBanner() {
  const [data, setData] = useState<{ needsPlanning: boolean; nextMonth: string; postCount: number } | null>(null);

  useEffect(() => {
    fetch("/api/planejamento/status")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data || !data.needsPlanning) return null;

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Wand2 className="h-5 w-5 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">
            {data.postCount === 0
              ? `Nenhum post planejado para ${data.nextMonth}`
              : `Apenas ${data.postCount} posts planejados para ${data.nextMonth}`}
          </p>
          <p className="text-xs text-muted-foreground">
            Use o gerador de planejamento para criar posts com roteiros automaticamente
          </p>
        </div>
      </div>
      <Link
        href="/planejamento"
        className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 text-amber-400 font-medium text-sm rounded-lg hover:bg-amber-500/20 transition-colors border border-amber-500/20"
      >
        Planejar
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
