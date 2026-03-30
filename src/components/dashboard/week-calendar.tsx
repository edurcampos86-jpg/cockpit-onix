"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays } from "lucide-react";

interface Post {
  id: string;
  title: string;
  format: string;
  category: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string | null;
  ctaType: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  pergunta_semana: "Pergunta da Semana",
  onix_pratica: "Onix na Prática",
  patrimonio_mimimi: "Patrimônio sem Mimimi",
  alerta_patrimonial: "Alerta Patrimonial",
  sabado_bastidores: "Sábado de Bastidores",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-zinc-600 text-zinc-100",
  roteiro_pronto: "bg-blue-600 text-blue-100",
  gravado: "bg-purple-600 text-purple-100",
  editado: "bg-amber-600 text-amber-100",
  agendado: "bg-cyan-600 text-cyan-100",
  publicado: "bg-emerald-600 text-emerald-100",
};

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  roteiro_pronto: "Roteiro Pronto",
  gravado: "Gravado",
  editado: "Editado",
  agendado: "Agendado",
  publicado: "Publicado",
};

const FORMAT_LABELS: Record<string, string> = {
  reel: "Reels",
  story: "Stories",
  carrossel: "Carrossel",
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const CTA_COLORS: Record<string, string> = {
  explicito: "bg-red-500/20 text-red-400 border-red-500/30",
  implicito: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  identificacao: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const CTA_LABELS: Record<string, string> = {
  explicito: "CTA Explícito",
  implicito: "CTA Implícito",
  identificacao: "Identificação",
};

interface WeekCalendarProps {
  posts: Post[];
}

export function WeekCalendar({ posts }: WeekCalendarProps) {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  // Generate 7 days starting from Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Calendário da Semana</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((date, idx) => {
            const dateStr = date.toISOString().split("T")[0];
            const dayPosts = posts.filter((p) => {
              const postDate = new Date(p.scheduledDate).toISOString().split("T")[0];
              return postDate === dateStr;
            });
            const isToday = date.toDateString() === today.toDateString();
            const isPast = date < today && !isToday;
            const dayIndex = (idx + 1) % 7; // 0=Sun...6=Sat but we start from Monday

            return (
              <div
                key={dateStr}
                className={`rounded-lg border p-3 min-h-[200px] transition-colors ${
                  isToday
                    ? "border-primary bg-primary/5"
                    : isPast
                    ? "border-border/50 bg-background/50 opacity-70"
                    : "border-border bg-background"
                }`}
              >
                {/* Day Header */}
                <div className="text-center mb-3">
                  <p className={`text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                    {DAY_LABELS[date.getDay()]}
                  </p>
                  <p className={`text-lg font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                    {date.getDate()}
                  </p>
                </div>

                {/* Posts */}
                <div className="space-y-2">
                  {dayPosts.map((post) => (
                    <div
                      key={post.id}
                      className="rounded-md border border-border/50 bg-card p-2 cursor-pointer hover:border-primary/30 transition-colors"
                    >
                      <p className="text-xs font-medium text-foreground line-clamp-2 mb-1.5">
                        {post.title}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[post.status] || ""}`}>
                          {STATUS_LABELS[post.status] || post.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border text-muted-foreground">
                          {FORMAT_LABELS[post.format] || post.format}
                        </Badge>
                      </div>
                      {post.ctaType && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-1 ${CTA_COLORS[post.ctaType] || ""}`}>
                          {CTA_LABELS[post.ctaType] || post.ctaType}
                        </Badge>
                      )}
                      {post.scheduledTime && (
                        <p className="text-[10px] text-muted-foreground mt-1">{post.scheduledTime}</p>
                      )}
                    </div>
                  ))}

                  {dayPosts.length === 0 && (
                    <div className="flex items-center justify-center h-20 text-muted-foreground/50">
                      <p className="text-xs">Sem posts</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
