"use client";

import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import {
  CATEGORY_LABELS,
  DAY_CATEGORY_MAP,
  DAY_FORMAT_MAP,
  CATEGORY_CTA_MAP,
  type PostCategory,
  type PostFormat,
} from "@/lib/types";

interface FillWeekButtonProps {
  currentDate: Date;
  existingCategories: string[];
  onFilled: () => void;
}

export function FillWeekButton({ currentDate, existingCategories, onFilled }: FillWeekButtonProps) {
  const [filling, setFilling] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Calcular quais quadros fixos faltam
  const dow = currentDate.getDay();
  const monday = new Date(currentDate);
  monday.setDate(currentDate.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(12, 0, 0, 0);

  const missingDays: { jsDay: number; category: PostCategory; format: PostFormat; date: Date }[] = [];

  for (const [dayStr, cat] of Object.entries(DAY_CATEGORY_MAP)) {
    const jsDay = parseInt(dayStr);
    if (cat && !existingCategories.includes(cat)) {
      const date = new Date(monday);
      const offset = jsDay === 0 ? 6 : jsDay - 1;
      date.setDate(monday.getDate() + offset);
      const format = DAY_FORMAT_MAP[jsDay] || ("reel" as PostFormat);
      missingDays.push({ jsDay, category: cat, format, date });
    }
  }

  if (missingDays.length === 0) return null;

  const handleFill = async () => {
    setFilling(true);
    try {
      // Get current user
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      const userId = meData.userId;

      for (const item of missingDays) {
        const ctaType = CATEGORY_CTA_MAP[item.category];
        await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: `${CATEGORY_LABELS[item.category]} — [definir tema]`,
            format: item.format,
            category: item.category,
            ctaType,
            scheduledDate: item.date.toISOString(),
            scheduledTime: "12:00",
            status: "rascunho",
            authorId: userId,
            generateTasks: true,
          }),
        });
      }

      onFilled();
    } catch (error) {
      console.error("Erro ao preencher semana:", error);
    } finally {
      setFilling(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-600/90 transition-colors text-sm"
        >
          <CalendarPlus className="h-4 w-4" />
          Preencher Semana ({missingDays.length} faltando)
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={handleFill}
            disabled={filling}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-600/90 transition-colors text-sm disabled:opacity-50"
          >
            {filling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
            {filling ? "Criando..." : `Confirmar (${missingDays.length} posts)`}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="px-3 py-2 text-sm rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          >
            Cancelar
          </button>
        </div>
      )}
    </>
  );
}
