"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Mic,
  Clock,
  Users,
  Sparkles,
  FileText,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  CheckSquare,
  Loader2,
} from "lucide-react";
import { CATEGORY_LABELS, type PostCategory } from "@/lib/types";

interface MeetingData {
  id: string;
  title: string;
  date: string;
  duration: number | null;
  participants: string | null;
  transcription: string | null;
  summary: string | null;
  insights: string | null;
  actionItems: string | null;
  source: string;
  lead: { name: string; productInterest: string | null } | null;
}

export default function ReunioesPage() {
  const [meetings, setMeetings] = useState<MeetingData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generatingScript, setGeneratingScript] = useState<string | null>(null);
  const [scriptResult, setScriptResult] = useState<{ id: string; script: string } | null>(null);

  const fetchMeetings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meetings?limit=50");
      const data = await res.json();
      setMeetings(data);
    } catch (error) {
      console.error("Error fetching meetings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const handleAnalyze = async (meetingId: string) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });
      if (res.ok) fetchMeetings();
    } catch (error) {
      console.error("Error analyzing:", error);
    }
  };

  const handleGenerateScript = async (meetingId: string, category: string) => {
    setGeneratingScript(meetingId);
    setScriptResult(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_script", category }),
      });
      const data = await res.json();
      if (data.success) {
        setScriptResult({ id: meetingId, script: data.script });
      }
    } catch (error) {
      console.error("Error generating script:", error);
    } finally {
      setGeneratingScript(null);
    }
  };

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/integracoes/zapier/webhook`
    : "/api/integracoes/zapier/webhook";

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <PageHeader
          title="Reuniões"
          description="Transcrições do Plaud.ai e insights para roteiros"
        />
      </div>

      {/* Webhook info */}
      <Card className="mb-6 border-primary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Webhook Zapier</p>
              <p className="text-xs text-muted-foreground mt-1">
                Configure no Zapier: Plaud.ai (trigger) → Webhooks POST (action) para:
              </p>
              <code className="text-xs bg-background border border-border px-2 py-1 rounded mt-1 block text-primary break-all">
                {webhookUrl}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meetings list */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px] text-muted-foreground text-sm">
          Carregando reuniões...
        </div>
      ) : meetings.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-muted-foreground">
          <Mic className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Nenhuma reunião recebida ainda</p>
          <p className="text-xs mt-1">Configure o Zapier para enviar transcrições do Plaud.ai</p>
        </div>
      ) : (
        <div className="space-y-4">
          {meetings.map((meeting) => {
            const isExpanded = expandedId === meeting.id;
            return (
              <Card key={meeting.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/20 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : meeting.id)}
                >
                  <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                    <Mic className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground truncate">{meeting.title}</h3>
                      {meeting.insights && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-emerald-500/10 text-emerald-400">
                          Analisado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{new Date(meeting.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      {meeting.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {meeting.duration}min
                        </span>
                      )}
                      {meeting.participants && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {meeting.participants}
                        </span>
                      )}
                      {meeting.lead && (
                        <span className="text-primary font-medium">
                          Lead: {meeting.lead.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4 bg-accent/5">
                    {/* Summary */}
                    {meeting.summary && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" />
                          Resumo
                        </h4>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.summary}</p>
                      </div>
                    )}

                    {/* Insights */}
                    {meeting.insights && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                          <Lightbulb className="h-3.5 w-3.5 text-primary" />
                          Insights para Conteúdo
                        </h4>
                        <div className="text-sm text-foreground whitespace-pre-wrap bg-card border border-border rounded-lg p-3">
                          {meeting.insights}
                        </div>
                      </div>
                    )}

                    {/* Action Items */}
                    {meeting.actionItems && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                          <CheckSquare className="h-3.5 w-3.5" />
                          Itens de Ação
                        </h4>
                        <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.actionItems}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                      {!meeting.insights && meeting.transcription && (
                        <button
                          onClick={() => handleAnalyze(meeting.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                        >
                          <Sparkles className="h-3 w-3" />
                          Analisar com IA
                        </button>
                      )}
                      {meeting.insights && (
                        <>
                          <p className="text-xs text-muted-foreground self-center mr-2">Gerar roteiro:</p>
                          {(["onix_pratica", "patrimonio_mimimi", "alerta_patrimonial", "pergunta_semana"] as PostCategory[]).map((cat) => (
                            <button
                              key={cat}
                              onClick={() => handleGenerateScript(meeting.id, cat)}
                              disabled={generatingScript === meeting.id}
                              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-border text-foreground hover:bg-accent hover:border-primary/30 transition-colors disabled:opacity-50"
                            >
                              {generatingScript === meeting.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                CATEGORY_LABELS[cat]
                              )}
                            </button>
                          ))}
                        </>
                      )}
                    </div>

                    {/* Generated Script */}
                    {scriptResult && scriptResult.id === meeting.id && (
                      <div className="bg-card border border-primary/20 rounded-lg p-4">
                        <h4 className="text-xs font-semibold text-primary uppercase mb-2">Roteiro Gerado</h4>
                        <div className="text-sm text-foreground whitespace-pre-wrap">
                          {scriptResult.script}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
