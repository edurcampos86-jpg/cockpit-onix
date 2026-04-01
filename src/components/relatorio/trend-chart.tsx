"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WeekData {
  weekLabel: string;
  total: number;
  published: number;
  goalMet: boolean;
  taskCompletion: number;
}

export function TrendChart() {
  const [data, setData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/relatorio/tendencia?weeks=8")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) return null;

  const maxPosts = Math.max(...data.map((d) => d.total), 5);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Tendência — Últimas 8 semanas</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Posts bar chart */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3">Posts por semana (meta: 5)</p>
          <div className="flex items-end gap-2 h-32">
            {data.map((week, i) => {
              const height = maxPosts > 0 ? (week.total / maxPosts) * 100 : 0;
              const pubHeight = maxPosts > 0 ? (week.published / maxPosts) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-bold text-foreground">{week.total}</span>
                  <div className="w-full relative" style={{ height: "100px" }}>
                    {/* Total bar */}
                    <div
                      className={`absolute bottom-0 w-full rounded-t-sm transition-all ${
                        week.goalMet ? "bg-primary/30" : "bg-zinc-700/50"
                      }`}
                      style={{ height: `${height}%` }}
                    />
                    {/* Published bar */}
                    <div
                      className="absolute bottom-0 w-full rounded-t-sm bg-emerald-500/70 transition-all"
                      style={{ height: `${pubHeight}%` }}
                    />
                    {/* Goal line at 5 */}
                    <div
                      className="absolute w-full border-t border-dashed border-primary/40"
                      style={{ bottom: `${(5 / maxPosts) * 100}%` }}
                    />
                  </div>
                  <span className="text-[8px] text-muted-foreground">{week.weekLabel}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-emerald-500/70" /> Publicados
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-primary/30" /> Total
            </span>
            <span className="flex items-center gap-1">
              <span className="w-4 border-t border-dashed border-primary/40" /> Meta (5)
            </span>
          </div>
        </div>

        {/* Task completion trend */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Taxa de conclusão de tarefas</p>
          <div className="flex items-end gap-2 h-16">
            {data.map((week, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[9px] font-medium text-foreground">{week.taskCompletion}%</span>
                <div className="w-full bg-zinc-800 rounded-t-sm h-10 relative">
                  <div
                    className="absolute bottom-0 w-full rounded-t-sm bg-blue-500/60 transition-all"
                    style={{ height: `${week.taskCompletion}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
