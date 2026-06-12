import { Activity, AlertCircle } from "lucide-react";

/* Seção 1 — status da integração (verde = configurada, cinza = não). */
export function PixelStatusCard({
  configured,
  pixelId,
  lastSyncAt,
  lastEventAt,
  eventCount30d,
}: {
  configured: boolean;
  pixelId: string | null;
  lastSyncAt: string | null;
  lastEventAt: string | null;
  eventCount30d: number;
}) {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Bahia" })
      : "—";

  if (!configured) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-5">
        <AlertCircle className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Integração Meta não configurada
          </p>
          <p className="text-sm text-muted-foreground">
            Defina META_ACCESS_TOKEN e META_AD_ACCOUNT_ID no Railway para
            ativar o sync de campanhas. O Pixel ID (META_PIXEL_ID) habilita o
            card de status completo.
          </p>
        </div>
      </div>
    );
  }

  const stats: Array<[string, string]> = [
    ["Pixel", pixelId ?? "—"],
    ["Último sync", fmt(lastSyncAt)],
    ["Último evento", fmt(lastEventAt)],
    ["Eventos (30d)", String(eventCount30d)],
  ];

  return (
    <div className="rounded-xl border border-border p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]" />
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">Pixel instalado</h3>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-0.5 text-sm font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
