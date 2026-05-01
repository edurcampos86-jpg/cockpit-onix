import { Shield, ShieldCheck, ShieldAlert, ShieldX, Key, KeyRound, LogIn, LogOut, UserCog, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/lib/auth-helpers";
import { listRecentEvents, type SecurityEventRow } from "@/lib/security/audit";

const EVENT_LABEL: Record<string, { label: string; icon: typeof Shield; tone: "ok" | "warn" | "fail" | "info" }> = {
  "login.ok":             { label: "Login realizado",                icon: LogIn,        tone: "ok" },
  "login.fail":           { label: "Tentativa de login falhou",      icon: ShieldX,      tone: "fail" },
  "login.rate_limited":   { label: "Login bloqueado por rate limit", icon: ShieldAlert,  tone: "warn" },
  "login.totp_ok":        { label: "2FA confirmado no login",        icon: ShieldCheck,  tone: "ok" },
  "login.totp_fail":      { label: "2FA falhou no login",            icon: ShieldX,      tone: "fail" },
  "logout":               { label: "Logout",                         icon: LogOut,       tone: "info" },
  "password.change":      { label: "Senha alterada",                 icon: Key,          tone: "info" },
  "totp.setup_start":     { label: "Iniciou setup de 2FA",           icon: KeyRound,     tone: "info" },
  "totp.enable":          { label: "Ativou 2FA",                     icon: ShieldCheck,  tone: "ok" },
  "totp.disable":         { label: "Desativou 2FA",                  icon: ShieldAlert,  tone: "warn" },
  "integration.secret_set": { label: "Secret de integração alterado", icon: UserCog,    tone: "warn" },
  "account.locked":       { label: "Conta bloqueada",                icon: AlertTriangle, tone: "fail" },
};

const TONE_CLASSES: Record<"ok" | "warn" | "fail" | "info", string> = {
  ok:   "text-emerald-500 bg-emerald-500/10",
  warn: "text-amber-500 bg-amber-500/10",
  fail: "text-destructive bg-destructive/10",
  info: "text-muted-foreground bg-muted",
};

function fmtRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d atrás`;
  return d.toLocaleDateString("pt-BR");
}

function fmtAbsolute(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function maskIp(ip: string | null): string {
  if (!ip) return "—";
  // IPv4: mostra primeiros 2 octetos. IPv6: primeiros 2 grupos.
  if (ip.includes(":")) {
    const groups = ip.split(":");
    return groups.slice(0, 2).join(":") + ":••";
  }
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.•.•`;
  return ip;
}

export default async function SegurancaAuditPage() {
  await requireAdmin(); // redireciona se não for admin
  const events = await listRecentEvents(200);

  const stats = computeStats(events);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <PageHeader
        title="Auditoria de Segurança"
        description="Últimos eventos sensíveis no Cockpit"
      />

      <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Logins (24h)" value={stats.loginsLast24h} tone="info" />
        <StatCard label="Falhas (24h)" value={stats.failsLast24h} tone={stats.failsLast24h > 5 ? "warn" : "info"} />
        <StatCard label="2FA ativados" value={stats.totpEnableTotal} tone="ok" />
        <StatCard label="Eventos críticos (24h)" value={stats.criticalLast24h} tone={stats.criticalLast24h > 0 ? "fail" : "ok"} />
      </div>

      <div className="mt-8 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-accent/30">
          <h2 className="text-base font-semibold text-foreground">
            Últimos {events.length} eventos
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            IPs mascarados parcialmente. Eventos mais antigos são purgados via política de retenção.
          </p>
        </div>

        {events.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            Nenhum evento registrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((e) => (
              <EventRow key={e.id} event={e} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" | "fail" | "info" }) {
  return (
    <div className={`bg-card border border-border rounded-xl p-4`}>
      <div className={`text-xs font-medium ${TONE_CLASSES[tone].split(" ")[0]}`}>{label}</div>
      <div className="text-2xl font-bold text-foreground mt-1">{value}</div>
    </div>
  );
}

function EventRow({ event }: { event: SecurityEventRow }) {
  const cfg = EVENT_LABEL[event.type] ?? { label: event.type, icon: Shield, tone: "info" as const };
  const Icon = cfg.icon;
  const tone = !event.success ? "fail" : cfg.tone;
  const created = new Date(event.createdAt);

  return (
    <div className="px-6 py-3 flex items-center gap-4 hover:bg-accent/20 transition-colors">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${TONE_CLASSES[tone]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{cfg.label}</span>
          {!event.success && (
            <span className="text-xs px-1.5 py-0.5 bg-destructive/10 text-destructive rounded">falha</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5 truncate">
          {event.user ? (
            <>
              <span className="font-medium text-foreground/80">{event.user.name}</span>
              {" · "}
            </>
          ) : (
            <span className="italic">usuário desconhecido</span>
          )}
          IP {maskIp(event.ip)}
          {event.metadata && Object.keys(event.metadata as object).length > 0 ? (
            <>
              {" · "}
              <code className="text-[10px]">{JSON.stringify(event.metadata)}</code>
            </>
          ) : null}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground shrink-0">
        <div>{fmtRelative(created)}</div>
        <div className="text-[10px] opacity-60">{fmtAbsolute(created)}</div>
      </div>
    </div>
  );
}

function computeStats(events: SecurityEventRow[]): {
  loginsLast24h: number;
  failsLast24h: number;
  totpEnableTotal: number;
  criticalLast24h: number;
} {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const last24h = (e: SecurityEventRow) => now - new Date(e.createdAt).getTime() < day;
  return {
    loginsLast24h: events.filter((e) => e.type === "login.ok" && last24h(e)).length,
    failsLast24h: events.filter((e) => !e.success && last24h(e)).length,
    totpEnableTotal: events.filter((e) => e.type === "totp.enable").length,
    criticalLast24h: events.filter(
      (e) => last24h(e) && (e.type === "totp.disable" || e.type === "integration.secret_set" || e.type === "account.locked"),
    ).length,
  };
}
