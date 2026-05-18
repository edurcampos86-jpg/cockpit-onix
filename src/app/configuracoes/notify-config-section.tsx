"use client";

import { useActionState, useEffect, useState } from "react";
import {
  getNotifyConfigStatus,
  saveNotifyConfig,
  testNotify,
  type NotifyConfigStatus,
  type SaveNotifyConfigState,
} from "@/app/actions/notify-config";
import { Bell, CheckCircle2, AlertCircle, Send } from "lucide-react";

const FIELDS: Array<{
  name: keyof NotifyConfigStatus;
  label: string;
  placeholder: string;
  helper: string;
  type?: "url" | "text";
}> = [
  {
    name: "SLACK_ALERTS_WEBHOOK_URL",
    label: "Slack — Webhook URL",
    placeholder: "https://hooks.slack.com/services/T.../B.../...",
    helper: "Incoming Webhook do canal #ecossistema-onix. Criar em api.slack.com/apps.",
    type: "url",
  },
  {
    name: "DATACRAZY_ALERTS_PHONE",
    label: "WhatsApp — Número de destino",
    placeholder: "5571999999999",
    helper: "Apenas dígitos. Inclua 55 (Brasil) + DDD + número.",
  },
  {
    name: "DATACRAZY_ALERTS_INSTANCE",
    label: "Datacrazy — ID da instância",
    placeholder: "3E8B5A39403F51C16509FA5FB5498E95",
    helper: "ID da instância Z-API que envia o WhatsApp (Datacrazy → Conexões).",
  },
  {
    name: "DATACRAZY_CLIENT_TOKEN",
    label: "Datacrazy — Token de segurança (opcional)",
    placeholder: "Deixe em branco se a Z-API não exige",
    helper: "Vai no header Client-Token. Necessário só se a instância Z-API tem isso ativado.",
  },
];

export function NotifyConfigSection() {
  const [initialStatus, setInitialStatus] = useState<NotifyConfigStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [state, action, pending] = useActionState<SaveNotifyConfigState, FormData>(
    saveNotifyConfig,
    undefined,
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // O status mais novo: o que o action devolveu (após save) ou o que veio do fetch inicial.
  const status = state?.success ? state.status : initialStatus;

  useEffect(() => {
    let alive = true;
    getNotifyConfigStatus().then((s) => {
      if (!alive) return;
      if ("error" in s) {
        setStatusError(s.error);
      } else {
        setInitialStatus(s);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    const r = await testNotify();
    if ("error" in r) {
      setTestResult(`Erro: ${r.error}`);
    } else {
      const parts: string[] = [];
      parts.push(r.slack ? "Slack ✓" : "Slack ✗ (verifique SLACK_ALERTS_WEBHOOK_URL)");
      parts.push(
        r.whatsapp
          ? "WhatsApp ✓"
          : "WhatsApp ✗ (verifique DATACRAZY_TOKEN/INSTANCE/PHONE)",
      );
      setTestResult(parts.join(" · "));
    }
    setTesting(false);
  }

  if (statusError) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
        {statusError}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-accent/30">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bell className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Notificações</h2>
          <p className="text-xs text-muted-foreground">
            Canais que recebem alertas dos crons (healthcheck, auditoria)
          </p>
        </div>
      </div>

      <form action={action} className="p-6 space-y-5">
        {FIELDS.map((f) => {
          const s = status?.[f.name];
          return (
            <div key={f.name} className="space-y-1.5">
              <label htmlFor={f.name} className="text-sm font-medium text-foreground flex items-center gap-2">
                {f.label}
                {s?.saved && (
                  <span className="text-xs text-emerald-400 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> salvo ({s.masked})
                  </span>
                )}
              </label>
              <input
                id={f.name}
                name={f.name}
                type={f.type === "url" ? "url" : "text"}
                placeholder={f.placeholder}
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors text-sm"
              />
              <p className="text-xs text-muted-foreground">{f.helper}</p>
            </div>
          );
        })}

        {state?.success && (
          <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm rounded-lg px-4 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Configurações salvas.
          </div>
        )}

        {state?.error && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {state.error}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={onTest}
            disabled={testing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-background border border-input text-foreground hover:bg-accent rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {testing ? "Disparando teste..." : "Testar notificação"}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </div>

        {testResult && (
          <div className="text-sm bg-background border border-border rounded-lg px-4 py-3 text-muted-foreground">
            {testResult}
          </div>
        )}
      </form>
    </div>
  );
}
