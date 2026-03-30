import { CalendarDays, CheckCircle2, Clock, FileText } from "lucide-react";
import type { CalendarPost } from "@/app/calendario/page";

export function CalendarStats({ posts }: { posts: CalendarPost[] }) {
  const total = posts.length;
  const publicados = posts.filter((p) => p.status === "publicado").length;
  const rascunhos = posts.filter((p) => p.status === "rascunho").length;
  const emProducao = total - publicados - rascunhos;
  const taxa = total > 0 ? Math.round((publicados / total) * 100) : 0;

  const stats = [
    {
      label: "Total de posts",
      value: total,
      icon: CalendarDays,
      color: "text-primary",
    },
    {
      label: "Publicados",
      value: publicados,
      sublabel: `${taxa}% do total`,
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Em produção",
      value: emProducao,
      icon: Clock,
      color: "text-blue-400",
    },
    {
      label: "Rascunhos",
      value: rascunhos,
      icon: FileText,
      color: "text-zinc-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-card border border-border rounded-xl p-4 flex items-center gap-3"
        >
          <div className={`${s.color}`}>
            <s.icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-foreground">{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.sublabel || s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
