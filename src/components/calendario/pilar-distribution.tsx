"use client";

import {
  CATEGORY_PILAR_MAP,
  PILAR_LABELS,
  PILAR_WEEKLY_GOAL,
  type PostCategory,
  type PilarEditorial,
} from "@/lib/types";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface PilarDistributionProps {
  posts: { category: string }[];
}

const PILAR_DOT_COLORS: Record<PilarEditorial, string> = {
  P1: "bg-blue-500",
  P2: "bg-amber-500",
  P3: "bg-red-500",
  P4: "bg-emerald-500",
};

export function PilarDistribution({ posts }: PilarDistributionProps) {
  const counts: Record<PilarEditorial, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const p of posts) {
    const pilar = CATEGORY_PILAR_MAP[p.category as PostCategory];
    if (pilar) counts[pilar]++;
  }

  const allMet = (Object.entries(PILAR_WEEKLY_GOAL) as [PilarEditorial, number][]).every(
    ([p, goal]) => counts[p] >= goal
  );

  return (
    <div className={`rounded-xl border p-3 ${allMet ? "bg-blue-500/5 border-blue-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
      <div className="flex items-center gap-2 mb-2">
        {allMet ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
        )}
        <span className={`text-xs font-semibold ${allMet ? "text-blue-400" : "text-amber-400"}`}>
          Pilares Editoriais
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(["P1", "P2", "P3", "P4"] as PilarEditorial[]).map((p) => {
          const goal = PILAR_WEEKLY_GOAL[p];
          const met = counts[p] >= goal;
          return (
            <div key={p} className="text-center">
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <span className={`w-2 h-2 rounded-full ${PILAR_DOT_COLORS[p]}`} />
                <span className="text-[10px] font-bold text-foreground">{p}</span>
              </div>
              <span className={`text-[11px] font-semibold ${met ? "text-emerald-400" : "text-red-400"}`}>
                {counts[p]}/{goal}
              </span>
              <p className="text-[8px] text-muted-foreground leading-tight mt-0.5 truncate">
                {PILAR_LABELS[p]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
