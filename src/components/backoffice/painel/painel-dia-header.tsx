"use client";

import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  timeZone: "America/Bahia",
});

export function PainelDiaHeader({
  data,
  pendingSyncCount,
}: {
  data: string;
  pendingSyncCount: number;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-muted-foreground capitalize">
        {fmtData.format(new Date(`${data}T12:00:00-03:00`))}
      </span>
      {pendingSyncCount > 0 && (
        <Badge variant="outline">
          {pendingSyncCount} aguardando sync
        </Badge>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={() => start(() => router.refresh())}
        disabled={isPending}
      >
        <RefreshCw className={isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        Atualizar
      </Button>
    </div>
  );
}
