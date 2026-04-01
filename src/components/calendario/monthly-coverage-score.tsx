"use client";

import { TrendingUp, Target } from "lucide-react";
import {
  CATEGORY_PILAR_MAP,
  PILAR_LABELS,
  type PostCategory,
  type PilarEditorial,
} from "@/lib/types";

interface MonthlyCoverageScoreProps {
  posts: { category: string; scheduledDate: string }[];
  year: number;
  month: number;
}

export function MonthlyCoverageScore({ posts, year, month }: MonthlyCoverageScoreProps) {
  if (posts.length === 0) return null;

  // Count weeks in the month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const totalDays = lastDay.getDate();

  // Group posts by week number (ISO week within the month)
  const weekSets: Set<number>[] = [];
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    const weekIdx = Math.floor((d - 1 + firstDay.getDay()) / 7);
    if (!weekSets[weekIdx]) weekSets[weekIdx] = new Set();
  }
  const totalWeeks = weekSets.length || 1;

  // Average posts per week
  const avgPostsPerWeek = posts.length / totalWeeks;

  // Pilar distribution
  const pilarCounts: Record<PilarEditorial, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const p of posts) {
    const pilar = CATEGORY_PILAR_MAP[p.category as PostCategory];
    if (pilar) pilarCounts[pilar]++;
  }
  const totalPilarPosts = Object.values(pilarCounts).reduce((a, b) => a + b, 0);

  // Consistency score (0-100)
  const goalMetRate = Math.min(avgPostsPerWeek / 5, 1); // 5 posts/week = 100%
  const pilarBalance = (() => {
    if (totalPilarPosts === 0) return 0;
    const ideal = { P1: 0.4, P2: 0.2, P3: 0.2, P4: 0.2 }; // P1(2/5), P2(1/5), P3(1/5), P4(1/5)
    let diff = 0;
    for (const [p, target] of Object.entries(ideal) as [PilarEditorial, number][]) {
      diff += Math.abs((pilarCounts[p] / totalPilarPosts) - target);
    }
    return Math.max(0, 1 - diff); // lower diff = better
  })();

  const score = Math.round(((goalMetRate * 0.6) + (pilarBalance * 0.4)) * 100);

  const PILAR_DOT: Record<PilarEditorial, string> = {
    P1: "bg-blue-500",
    P2: "bg-amber-500",
    P3: "bg-red-500",
    P4: "bg-emerald-500",
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Score de Consistência Mensal</h3>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div className="text-center">
          <p className={`text-3xl font-bold ${score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {score}
          </p>
          <p className="text-[9px] text-muted-foreground">de 100</p>
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Média/semana</span>
            <span className={`font-semibold ${avgPostsPerWeek >= 5 ? "text-emerald-400" : "text-amber-400"}`}>
              {avgPostsPerWeek.toFixed(1)} posts
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">Total no mês</span>
            <span className="font-semibold text-foreground">{posts.length} posts</span>
          </div>
        </div>
      </div>

      {/* Pilar distribution bar */}
      {totalPilarPosts > 0 && (
        <div>
          <p className="text-[9px] text-muted-foreground mb-1">Distribuição de Pilares</p>
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-800">
            {(["P1", "P2", "P3", "P4"] as PilarEditorial[]).map((p) => (
              pilarCounts[p] > 0 ? (
                <div
                  key={p}
                  className={`${PILAR_DOT[p]} transition-all`}
                  style={{ width: `${(pilarCounts[p] / totalPilarPosts) * 100}%` }}
                  title={`${p}: ${pilarCounts[p]} posts`}
                />
              ) : null
            ))}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            {(["P1", "P2", "P3", "P4"] as PilarEditorial[]).map((p) => (
              <span key={p} className="flex items-center gap-1 text-[8px] text-muted-foreground">
                <span className={`w-1.5 h-1.5 rounded-full ${PILAR_DOT[p]}`} />
                {p} ({pilarCounts[p]})
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
