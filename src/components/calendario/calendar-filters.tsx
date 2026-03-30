import {
  FORMAT_LABELS,
  STATUS_LABELS,
  type PostFormat,
  type PostStatus,
} from "@/lib/types";

interface CalendarFiltersProps {
  filterFormat: PostFormat | "todos";
  filterStatus: PostStatus | "todos";
  onFormatChange: (v: PostFormat | "todos") => void;
  onStatusChange: (v: PostStatus | "todos") => void;
}

export function CalendarFilters({
  filterFormat,
  filterStatus,
  onFormatChange,
  onStatusChange,
}: CalendarFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={filterFormat}
        onChange={(e) => onFormatChange(e.target.value as PostFormat | "todos")}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="todos">Todos os formatos</option>
        {(Object.entries(FORMAT_LABELS) as [PostFormat, string][]).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>

      <select
        value={filterStatus}
        onChange={(e) => onStatusChange(e.target.value as PostStatus | "todos")}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-card border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        <option value="todos">Todos os status</option>
        {(Object.entries(STATUS_LABELS) as [PostStatus, string][]).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );
}
