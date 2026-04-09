"use client";

import { useState, useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare,
  Bot,
  Calendar,
  Zap,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Settings,
  Key,
  Landmark,
} from "lucide-react";

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "connected" | "disconnected" | "coming_soon";
  envKey?: string;
  extraEnvKey?: string;
  docsUrl?: string;
  features: string[];
}

const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: "manychat",
    name: "ManyChat",
    description: "Automação de DMs, captação de leads e fluxos de qualificação via Instagram",
    icon: <MessageSquare className="h-6 w-6" />,
    status: "disconnected",
    envKey: "MANYCHAT_API_TOKEN",
    docsUrl: "https://api.manychat.com",
    features: [
      "Importar leads automaticamente",
      "Classificar por palavra-chave (BLINDAGEM, SEGURO, IMÓVEL)",
      "Sincronizar tags e fluxos",
      "Notificar lead quente em tempo real",
    ],
  },
  {
    id: "claude_ai",
    name: "Claude AI",
    description: "IA para sugestão de roteiros, análise de performance e abordagem de leads",
    icon: <Bot className="h-6 w-6" />,
    status: "disconnected",
    envKey: "ANTHROPIC_API_KEY",
    docsUrl: "https://docs.anthropic.com",
    features: [
      "Sugestão de roteiros por quadro fixo (com gancho, CTA e hashtags)",
      "Análise de performance semanal com recomendações",
      "Geração de ideias de conteúdo por tema",
      "Sugestão de abordagem personalizada para leads",
    ],
  },
  {
    id: "zapier_plaud",
    name: "Zapier + Plaud.ai",
    description: "Receber transcrições de reuniões do Plaud e gerar roteiros personalizados com IA",
    icon: <Zap className="h-6 w-6" />,
    status: "disconnected",
    envKey: "ZAPIER_WEBHOOK_SECRET",
    docsUrl: "https://zapier.com/apps/webhooks",
    features: [
      "Receber transcrições de reuniões automaticamente",
      "Análise com IA: extrair insights, ações e oportunidades",
      "Gerar roteiros personalizados baseados em reuniões reais",
      "Associar reuniões a leads do pipeline",
    ],
  },
  {
    id: "btg_pactual",
    name: "BTG Pactual — Partner API",
    description: "OAuth2 client_credentials via IaaS Auth — APIs de parceiro (Position, etc.) do BTG Pactual",
    icon: <Landmark className="h-6 w-6" />,
    status: "disconnected",
    envKey: "BTG_CLIENT_SECRET",
    extraEnvKey: "BTG_CLIENT_ID",
    docsUrl: "https://developer-partner.btgpactual.com/documentation/api/auth",
    features: [
      "Autenticação via api.btgpactual.com/iaas-auth (Basic + client_credentials)",
      "Token Bearer válido por 15 minutos com cache em memória",
      "Header x-id-partner-request gerado automaticamente por requisição",
      "Base para futuras integrações: Position Partner e demais APIs IaaS",
    ],
  },
  {
    id: "manus",
    name: "Manus AI",
    description: "Agente autônomo de IA — API em desenvolvimento, verificação semanal ativa",
    icon: <Bot className="h-6 w-6" />,
    status: "coming_soon",
    docsUrl: "https://manus.im",
    features: [
      "Pesquisa de mercado automatizada",
      "Automação de tarefas complexas",
      "Integração será ativada assim que API pública estiver disponível",
    ],
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Sincronizar programação de postagens com o Google Calendar automaticamente",
    icon: <Calendar className="h-6 w-6" />,
    status: "disconnected",
    envKey: "GOOGLE_CLIENT_ID",
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    features: [
      "Criar eventos automaticamente ao agendar posts",
      "Atualizar eventos ao mudar data/hora da publicação",
      "Remover eventos ao excluir posts",
      "Sincronizar posts existentes com um clique",
    ],
  },
  {
    id: "meta",
    name: "Meta Graph API",
    description: "Instagram Business — métricas, agendamento e dados de audiência",
    icon: <Zap className="h-6 w-6" />,
    status: "disconnected",
    envKey: "META_ACCESS_TOKEN",
    docsUrl: "https://developers.facebook.com/docs/instagram-api/",
    features: [
      "Métricas de posts (salvamentos, compartilhamentos, retenção)",
      "Agendamento de publicação automática",
      "Dados de audiência e crescimento",
      "Ranking de posts por engajamento",
    ],
  },
];

const STATUS_BADGE: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  connected: {
    label: "Conectado",
    class: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  pending_auth: {
    label: "Aguardando autorização",
    class: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: <Key className="h-3.5 w-3.5" />,
  },
  disconnected: {
    label: "Não conectado",
    class: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
  coming_soon: {
    label: "Em breve",
    class: "bg-primary/10 text-primary border-primary/20",
    icon: <Zap className="h-3.5 w-3.5" />,
  },
};

export default function IntegracoesPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [actionResult, setActionResult] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  const refreshStatus = async () => {
    try {
      const res = await fetch("/api/integracoes/status");
      const data = await res.json();
      const map: Record<string, string> = {};
      for (const [key, val] of Object.entries(data)) {
        map[key] = (val as { status: string }).status;
      }
      setStatusMap(map);
    } catch { /* ignore */ }
  };

  // Carregar status das integrações e chaves mascaradas
  useEffect(() => {
    refreshStatus();
    // Carregar chaves mascaradas para mostrar quais já estão configuradas
    fetch("/api/integracoes/config")
      .then((r) => r.json())
      .then((data: Record<string, string>) => setMaskedKeys(data))
      .catch(() => {});
  }, []);

  const handleSaveKey = async (integrationId: string, envKey: string) => {
    setSaving(true);
    setActionResult(null);
    try {
      await fetch("/api/integracoes/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: envKey, value: apiKeys[integrationId] }),
      });
      setActionResult({ id: integrationId, msg: "Chave salva com sucesso!", ok: true });
      // Atualizar status e chaves mascaradas
      await refreshStatus();
      const configRes = await fetch("/api/integracoes/config");
      const configData = await configRes.json();
      setMaskedKeys(configData);
      // Limpar campo de input após salvar
      setApiKeys((prev) => ({ ...prev, [integrationId]: "" }));
    } catch {
      setActionResult({ id: integrationId, msg: "Erro ao salvar", ok: false });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (integrationId: string, testUrl: string) => {
    setActionResult(null);
    try {
      const res = await fetch(testUrl);
      const data = await res.json();
      setActionResult({ id: integrationId, msg: data.message, ok: data.success });
    } catch {
      setActionResult({ id: integrationId, msg: "Erro ao testar conexão", ok: false });
    }
  };

  const handleSync = async (integrationId: string, syncUrl: string) => {
    setActionResult(null);
    try {
      const res = await fetch(syncUrl, { method: "POST" });
      const data = await res.json();
      setActionResult({ id: integrationId, msg: data.message, ok: data.success });
    } catch {
      setActionResult({ id: integrationId, msg: "Erro ao sincronizar", ok: false });
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const res = await fetch("/api/integracoes/google/auth");
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, "_blank");
      }
    } catch {
      setActionResult({ id: "google_calendar", msg: "Erro ao iniciar autenticação", ok: false });
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <PageHeader
        title="Integrações"
        description="Conecte suas ferramentas para automatizar o fluxo de trabalho"
      />

      <div className="mt-8 space-y-4">
        <ComoFunciona
          proposito="Catálogo das ferramentas externas conectadas ao Cockpit (ManyChat, Claude AI, Zapier/Plaud, BTG, Meta, etc.) e o que cada uma habilita."
          comoUsar="Veja o status de cada conexão. Para conectar uma nova, siga as instruções no card. Cada integração desbloqueia um conjunto de automações listadas abaixo."
          comoAjuda="Centraliza tudo num só lugar: você sabe rapidamente o que está ativo, o que precisa configurar, e quais automações dependem de quais conexões."
        />
        {INTEGRATIONS.map((integration) => {
          // Usar status da API se disponível, senão o default hardcoded
          const liveStatus = statusMap[integration.id] || integration.status;
          const badge = STATUS_BADGE[liveStatus] || STATUS_BADGE[integration.status];
          const isExpanded = expandedId === integration.id;

          return (
            <Card key={integration.id} className="overflow-hidden">
              <div
                className="flex items-center gap-4 p-5 cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : integration.id)}
              >
                <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
                  {integration.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-foreground">{integration.name}</h3>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${badge.class}`}>
                      {badge.icon}
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{integration.description}</p>
                </div>
                <Settings className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </div>

              {isExpanded && (
                <div className="border-t border-border p-5 bg-accent/10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Funcionalidades */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Funcionalidades</h4>
                      <ul className="space-y-2">
                        {integration.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="text-primary mt-0.5 shrink-0">&#x2022;</span>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Configuração */}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Configuração</h4>

                      {liveStatus === "coming_soon" ? (
                        <div className="bg-card border border-border rounded-lg p-4 text-center">
                          <Bot className="h-8 w-8 text-primary/50 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Integração em desenvolvimento. Será disponibilizada em breve.
                          </p>
                        </div>
                      ) : integration.envKey ? (
                        <div className="space-y-3">
                          {/* Indicador de chave já configurada */}
                          {maskedKeys[integration.envKey] && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span className="text-xs text-emerald-400 font-medium">
                                Chave configurada: {maskedKeys[integration.envKey]}
                              </span>
                            </div>
                          )}
                          {integration.extraEnvKey && (
                            <div className="space-y-1.5">
                              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                <Key className="h-3 w-3" />
                                {integration.extraEnvKey}
                              </label>
                              {maskedKeys[integration.extraEnvKey] && (
                                <div className="text-[10px] text-emerald-400">
                                  Configurado: {maskedKeys[integration.extraEnvKey]}
                                </div>
                              )}
                              <input
                                type="text"
                                value={apiKeys[`${integration.id}__extra`] || ""}
                                onChange={(e) =>
                                  setApiKeys((prev) => ({ ...prev, [`${integration.id}__extra`]: e.target.value }))
                                }
                                placeholder={maskedKeys[integration.extraEnvKey] ? "Substituir..." : "Cole o Client ID aqui..."}
                                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                              />
                              <button
                                onClick={async () => {
                                  const v = apiKeys[`${integration.id}__extra`];
                                  if (!v) return;
                                  await fetch("/api/integracoes/config", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ key: integration.extraEnvKey, value: v }),
                                  });
                                  setApiKeys((p) => ({ ...p, [`${integration.id}__extra`]: "" }));
                                  await refreshStatus();
                                  const c = await (await fetch("/api/integracoes/config")).json();
                                  setMaskedKeys(c);
                                }}
                                disabled={!apiKeys[`${integration.id}__extra`]}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-accent disabled:opacity-50"
                              >
                                Salvar Client ID
                              </button>
                            </div>
                          )}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                              <Key className="h-3 w-3" />
                              {integration.envKey}
                            </label>
                            <input
                              type="password"
                              value={apiKeys[integration.id] || ""}
                              onChange={(e) =>
                                setApiKeys((prev) => ({ ...prev, [integration.id]: e.target.value }))
                              }
                              placeholder={maskedKeys[integration.envKey] ? "Substituir chave existente..." : "Cole sua API key aqui..."}
                              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => handleSaveKey(integration.id, integration.envKey!)}
                              disabled={saving || !apiKeys[integration.id]}
                              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                              {saving ? "Salvando..." : maskedKeys[integration.envKey!] ? "Atualizar Chave" : "Salvar Chave"}
                            </button>
                            {/* ManyChat: Testar + Sincronizar */}
                            {integration.id === "manychat" && statusMap.manychat === "connected" && (
                              <>
                                <button
                                  onClick={() => handleTest("manychat", "/api/integracoes/manychat/test")}
                                  className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                                >
                                  Testar
                                </button>
                                <button
                                  onClick={() => handleSync("manychat", "/api/integracoes/manychat/sync")}
                                  className="px-3 py-2 text-sm font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                >
                                  Sincronizar Leads
                                </button>
                              </>
                            )}
                            {/* BTG Pactual: Testar token */}
                            {integration.id === "btg_pactual" && statusMap.btg_pactual === "connected" && (
                              <button
                                onClick={() => handleTest("btg_pactual", "/api/integracoes/btg/test")}
                                className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                              >
                                Testar Token
                              </button>
                            )}
                            {/* Claude AI: Testar */}
                            {integration.id === "claude_ai" && statusMap.claude_ai === "connected" && (
                              <button
                                onClick={() => handleTest("claude_ai", "/api/integracoes/ai")}
                                className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                              >
                                Testar Conexão
                              </button>
                            )}
                            {/* Zapier: Testar webhook */}
                            {integration.id === "zapier_plaud" && statusMap.zapier_plaud === "connected" && (
                              <span className="text-xs text-muted-foreground italic">
                                Webhook ativo — aguardando dados do Zapier
                              </span>
                            )}
                            {/* Google Calendar: Autorizar / Testar / Sincronizar */}
                            {integration.id === "google_calendar" && statusMap.google_calendar !== "connected" && (statusMap.google_calendar === "pending_auth" || apiKeys.google_calendar) && (
                              <button
                                onClick={handleGoogleAuth}
                                className="px-3 py-2 text-sm font-medium rounded-lg border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors"
                              >
                                Autorizar Google
                              </button>
                            )}
                            {integration.id === "google_calendar" && statusMap.google_calendar === "connected" && (
                              <>
                                <button
                                  onClick={() => handleTest("google_calendar", "/api/integracoes/google/test")}
                                  className="px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors"
                                >
                                  Testar
                                </button>
                                <button
                                  onClick={() => handleSync("google_calendar", "/api/integracoes/google/sync")}
                                  className="px-3 py-2 text-sm font-medium rounded-lg border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                                >
                                  Sincronizar Posts
                                </button>
                              </>
                            )}
                            {integration.docsUrl && (
                              <a
                                href={integration.docsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                Docs <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                          {/* Resultado da ação */}
                          {actionResult && actionResult.id === integration.id && (
                            <div className={`mt-3 px-3 py-2 rounded-lg text-xs font-medium ${actionResult.ok ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
                              {actionResult.msg}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Ideias de automação */}
      <Card className="mt-8 border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Automações planejadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Lead quente → Notificação instantânea", desc: "ManyChat detecta lead quente → push notification no celular + card no pipeline", tools: "ManyChat + Cockpit" },
              { title: "Post publicado → CTA automático", desc: "Publicação via Meta API → ManyChat ativa resposta automática nos comentários", tools: "Meta API + ManyChat" },
              { title: "Post agendado → Evento no calendário", desc: "Post criado no Cockpit → Evento automático no Google Calendar com horário de publicação", tools: "Google Calendar + Cockpit" },
              { title: "Performance acima da média → Impulsionar", desc: "Reel com engajamento acima de 2% → alerta para impulsionar com tráfego pago", tools: "Meta API + Cockpit" },
              { title: "Cross-sell 30 dias → Alerta automático", desc: "Cliente completa 30 dias → Manus sugere abordagem de seguro de vida ou consórcio", tools: "Manus + Cockpit" },
              { title: "Agenda do dia → Bloquear horário de gravação", desc: "Sync automático entre calendário editorial e Google Calendar para reservar horários", tools: "Google Calendar + Cockpit" },
            ].map((auto, i) => (
              <div key={i} className="bg-card border border-border rounded-lg p-3">
                <p className="text-sm font-medium text-foreground">{auto.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{auto.desc}</p>
                <p className="text-[10px] text-primary font-medium mt-2">{auto.tools}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
