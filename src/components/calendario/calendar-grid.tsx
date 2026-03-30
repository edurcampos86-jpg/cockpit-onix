"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { CalendarPostCard } from "@/components/calendario/calendar-post-card";
import type { CalendarPost } from "@/app/calendario/page";
import { Plus } from "lucide-react";

interface CalendarGridProps {
  year: number;
  month: number;
  posts: CalendarPost[];
  loading: boolean;
  onDayClick: (dateStr: string) => void;
  onPostMoved: (postId: string, newDate: string) => void;
}

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function CalendarGrid({
  year,
  month,
  posts,
  loading,
  onDayClick,
  onPostMoved,
}: CalendarGridProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const days = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay(); // 0=Sun
    const totalDays = lastDay.getDate();

    const cells: { date: Date | null; dateStr: string; isCurrentMonth: boolean }[] = [];

    // Previous month padding
    for (let i = startPad - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({
        date: d,
        dateStr: formatDateStr(d),
        isCurrentMonth: false,
      });
    }

    // Current month
    for (let day = 1; day <= totalDays; day++) {
      const d = new Date(year, month, day);
      cells.push({
        date: d,
        dateStr: formatDateStr(d),
        isCurrentMonth: true,
      });
    }

    // Next month padding
    const remaining = 7 - (cells.length % 7);
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        cells.push({
          date: d,
          dateStr: formatDateStr(d),
          isCurrentMonth: false,
        });
      }
    }

    return cells;
  }, [year, month]);

  const postsByDate = useMemo(() => {
    const map: Record<string, CalendarPost[]> = {};
    for (const post of posts) {
      const d = new Date(post.scheduledDate);
      const key = formatDateStr(d);
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    // Sort each day's posts by time
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => (a.scheduledTime || "").localeCompare(b.scheduledTime || ""));
    }
    return map;
  }, [posts]);

  const today = formatDateStr(new Date());

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(null);
    const postId = e.dataTransfer.getData("postId");
    if (postId) {
      onPostMoved(postId, dateStr);
    }
  };

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center min-h-[500px]">
        <div className="text-muted-foreground text-sm">Carregando calendário...</div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((cell) => {
          const dayPosts = postsByDate[cell.dateStr] || [];
          const isToday = cell.dateStr === today;
          const isDragOver = cell.dateStr === dragOverDate;

          return (
            <div
              key={cell.dateStr}
              className={cn(
                "min-h-[120px] border-b border-r border-border p-1.5 transition-colors relative group",
                !cell.isCurrentMonth && "bg-background/50",
                cell.isCurrentMonth && "bg-card",
                isDragOver && "bg-primary/5 ring-1 ring-inset ring-primary/30",
                isToday && "bg-primary/5"
              )}
              onDragOver={(e) => handleDragOver(e, cell.dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, cell.dateStr)}
            >
              {/* Day number + add button */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={cn(
                    "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && cell.isCurrentMonth && "text-foreground",
                    !cell.isCurrentMonth && "text-muted-foreground/50"
                  )}
                >
                  {cell.date?.getDate()}
                </span>
                {cell.isCurrentMonth && (
                  <button
                    onClick={() => onDayClick(cell.dateStr)}
                    className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                    title="Novo post"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Posts */}
              <div className="space-y-1">
                {dayPosts.map((post) => (
                  <CalendarPostCard key={post.id} post={post} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
