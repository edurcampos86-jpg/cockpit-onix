"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Plus,
  Phone,
  Mail,
  Clock,
  Flame,
  Snowflake,
  Thermometer,
  Trash2,
  GripVertical,
  User,
  MessageSquare,
} from "lucide-react";
import type { LeadStage, LeadTemperature } from "@/lib/types";
import { LeadTimer } from "@/components/leads/lead-timer";

interface LeadData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  origin: string;
  stage: string;
  temperature: string;
  productInterest: string | null;
  notes: string | null;
  lastContactAt: string | null;
  enteredAt: string;
  assignedTo: { name: string };
}

const STAGE_LABELS: Record<LeadStage, string> = {
  novo: "Novo Lead",
  qualificado: "Qualificado",
  reuniao_agendada: "Reunião Agendada",
  proposta_enviada: "Proposta Enviada",
  cliente_ativo: "Cliente Ativo",
};

const STAGE_COLORS: Record<LeadStage, string> = {
  novo: "border-t-blue-500",
  qualificado: "border-t-amber-500",
  reuniao_agendada: "border-t-purple-500",
  proposta_enviada: "border-t-cyan-500",
  cliente_ativo: "border-t-emerald-500",
};

const STAGE_BG: Record<LeadStage, string> = {
  novo: "bg-blue-500/10 text-blue-400",
  qualificado: "bg-amber-500/10 text-amber-400",
  reuniao_agendada: "bg-purple-500/10 text-purple-400",
  proposta_enviada: "bg-cyan-500/10 text-cyan-400",
  cliente_ativo: "bg-emerald-500/10 text-emerald-400",
};

const TEMP_ICONS: Record<string, React.ReactNode> = {
  quente: <Flame className="h-3 w-3 text-red-400" />,
  morno: <Thermometer className="h-3 w-3 text-amber-400" />,
  frio: <Snowflake className="h-3 w-3 text-blue-400" />,
};

const TEMP_LABELS: Record<string, string> = {
  quente: "Quente",
  morno: "Morno",
  frio: "Frio",
};

const ORIGIN_LABELS: Record<string, string> = {
  manychat: "ManyChat",
  dm: "DM Instagram",
  indicacao: "Indicação",
  trafego_pago: "Tráfego Pago",
  organico: "Orgânico",
};

const PRODUCT_LABELS: Record<string, string> = {
  investimentos: "Investimentos",
  seguro_vida: "Seguro de Vida",
  consorcio_saude: "Consórcio Saúde",
  imoveis: "Imóveis",
  msp: "Meu Sucesso Patrimonial",
};

const STAGES: LeadStage[] = ["novo", "qualificado", "reuniao_agendada", "proposta_enviada", "cliente_ativo"];

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewLead, setShowNewLead] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads");
      const data = await res.json();
      setLeads(data);
    } catch (error) {
      console.error("Error fetching leads:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    setDraggingId(leadId);
    e.dataTransfer.setData("text/plain", leadId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, newStage: LeadStage) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain");
    setDraggingId(null);

    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    );

    try {
      await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
    } catch {
      fetchLeads();
    }
  };

  const handleDelete = async (leadId: string) => {
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    try {
      await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    } catch {
      fetchLeads();
    }
  };

  const handleCreateLead = async (formData: FormData) => {
    const body = {
      name: formData.get("name") as string,
      email: (formData.get("email") as string) || null,
      phone: (formData.get("phone") as string) || null,
      origin: formData.get("origin") as string,
      temperature: formData.get("temperature") as string,
      productInterest: (formData.get("productInterest") as string) || null,
      notes: (formData.get("notes") as string) || null,
      assignedToId: formData.get("assignedToId") as string,
    };

    try {
      await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setShowNewLead(false);
      fetchLeads();
    } catch (error) {
      console.error("Error creating lead:", error);
    }
  };

  const getTimeSinceContact = (lastContactAt: string | null, enteredAt: string) => {
    const refDate = lastContactAt ? new Date(lastContactAt) : new Date(enteredAt);
    const diffMs = Date.now() - refDate.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    return `${diffD}d`;
  };

  const isResponseLate = (lead: LeadData) => {
    const refDate = lead.lastContactAt ? new Date(lead.lastContactAt) : new Date(lead.enteredAt);
    const diffMin = Math.floor((Date.now() - refDate.getTime()) / 60000);
    if (lead.temperature === "quente") return diffMin > 5;
    if (lead.temperature === "morno") return diffMin > 30;
    return diffMin > 120;
  };

  const totalLeads = leads.length;
  const hotLeads = leads.filter((l) => l.temperature === "quente").length;

  return (
    <div className="p-6 md:p-8 h-[calc(100vh-0px)] flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 shrink-0">
        <PageHeader
          title="Pipeline de Leads"
          description={`${totalLeads} leads no funil \u2022 ${hotLeads} quentes`}
        />
        <button
          onClick={() => setShowNewLead(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors text-sm self-start"
        >
          <Plus className="h-4 w-4" />
          Novo Lead
        </button>
      </div>

      {/* Kanban Board */}
      {loading ? (
        <div className="flex items-center justify-center flex-1 text-muted-foreground text-sm">
          Carregando leads...
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
          {STAGES.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage === stage);
            return (
              <div
                key={stage}
                className={`shrink-0 w-72 flex flex-col bg-card/50 rounded-xl border border-border border-t-2 ${STAGE_COLORS[stage]}`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage)}
              >
                {/* Column Header */}
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STAGE_BG[stage]}`}>
                      {stageLeads.length}
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">
                      {STAGE_LABELS[stage]}
                    </h3>
                  </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead.id)}
                      className={`bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors group ${
                        draggingId === lead.id ? "opacity-50" : ""
                      } ${isResponseLate(lead) && lead.stage !== "cliente_ativo" ? "ring-1 ring-red-500/30" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
                          <p className="text-sm font-medium text-foreground">{lead.name}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {TEMP_ICONS[lead.temperature]}
                          <span className="text-[10px] text-muted-foreground">
                            {TEMP_LABELS[lead.temperature]}
                          </span>
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="mt-2 space-y-1">
                        {lead.productInterest && (
                          <p className="text-[11px] text-primary font-medium">
                            {PRODUCT_LABELS[lead.productInterest] ?? lead.productInterest}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <MessageSquare className="h-2.5 w-2.5" />
                            {ORIGIN_LABELS[lead.origin] ?? lead.origin}
                          </span>
                        </div>
                        <LeadTimer
                          lastContactAt={lead.lastContactAt}
                          enteredAt={lead.enteredAt}
                          temperature={lead.temperature}
                          isActive={lead.stage !== "cliente_ativo"}
                        />
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5" />
                              {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5" />
                              {lead.email.length > 16
                                ? lead.email.slice(0, 16) + "..."
                                : lead.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <User className="h-2.5 w-2.5" />
                          {lead.assignedTo.name}
                        </span>
                        <button
                          onClick={() => handleDelete(lead.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          title="Excluir lead"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {stageLeads.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground/50 text-xs">
                      Arraste leads aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Lead Dialog */}
      {showNewLead && (
        <NewLeadDialog onClose={() => setShowNewLead(false)} onSubmit={handleCreateLead} />
      )}
    </div>
  );
}

function NewLeadDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [userId, setUserId] = useState("");

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.userId) setUserId(data.userId);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    await onSubmit(formData);
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Novo Lead</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Nome *</label>
            <input
              name="name"
              required
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Nome do lead"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <input
                name="email"
                type="email"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="email@exemplo.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Telefone</label>
              <input
                name="phone"
                type="tel"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="(71) 99999-0000"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Origem</label>
              <select
                name="origin"
                defaultValue="manychat"
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="manychat">ManyChat</option>
                <option value="dm">DM Instagram</option>
                <option value="indicacao">Indicação</option>
                <option value="trafego_pago">Tráfego Pago</option>
                <option value="organico">Orgânico</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Temperatura</label>
              <select
                name="temperature"
                defaultValue="morno"
                className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="quente">Quente</option>
                <option value="morno">Morno</option>
                <option value="frio">Frio</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Produto de Interesse</label>
            <select
              name="productInterest"
              defaultValue=""
              className="w-full px-3 py-2 text-sm rounded-lg bg-background border border-input text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Nenhum selecionado</option>
              <option value="investimentos">Assessoria de Investimentos</option>
              <option value="seguro_vida">Seguro de Vida Resgatável</option>
              <option value="consorcio_saude">Consórcio de Plano de Saúde</option>
              <option value="imoveis">Imóveis</option>
              <option value="msp">Meu Sucesso Patrimonial</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Observações</label>
            <textarea
              name="notes"
              rows={2}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Anotações sobre o lead..."
            />
          </div>
          {userId && <input type="hidden" name="assignedToId" value={userId} />}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !userId}
              className="px-4 py-2.5 bg-primary text-primary-foreground font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm"
            >
              {submitting ? "Criando..." : "Criar Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
