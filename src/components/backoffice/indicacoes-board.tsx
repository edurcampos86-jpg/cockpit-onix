"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  UserPlus,
  Phone,
  Calendar,
  CheckCircle2,
  XCircle,
  Heart,
  Mail,
} from "lucide-react";

interface Indicacao {
  id: string;
  nomeIndicado: string;
  emailIndicado: string | null;
  telefoneIndicado: string | null;
  status: string;
  valorEstimado: number | null;
  agradecimentoEnviado: boolean;
  notas: string | null;
  criadoEm: string;
  indicador: { id: string; nome: string; classificacao: string } | null;
}

interface Cliente {
  id: string;
  nome: string;
  classificacao: string;
}

const COLUNAS = [
  { id: "recebida", label: "Recebida", cor: "border-blue-300 bg-blue-50 dark:bg-blue-950/20", icon: UserPlus },
  { id: "contatada", label: "Contatada", cor: "border-amber-300 bg-amber-50 dark:bg-amber-950/20", icon: Phone },
  { id: "reuniao", label: "Em reunião", cor: "border-purple-300 bg-purple-50 dark:bg-purple-950/20", icon: Calendar },
  { id: "convertida", label: "Convertida", cor: "border-green-300 bg-green-50 dark:bg-green-950/20", icon: CheckCircle2 },
  { id: "perdida", label: "Perdida", cor: "border-red-300 bg-red-50 dark:bg-red-950/20", icon: XCircle },
] as const;

export function IndicacoesBoard({
  indicacoes: iniciais,
  clientes,
}: {
  indicacoes: Indicacao[];
  clientes: Cliente[];
}) {
  const [indicacoes, setIndicacoes] = useState(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    indicadorId: "",
    nomeIndicado: "",
    emailIndicado: "",
    telefoneIndicado: "",
    valorEstimado: "",
    notas: "",
  });

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(v);

  const porStatus = (s: string) => indicacoes.filter((i) => i.status === s);

  const total = indicacoes.length;
  const convertidas = indicacoes.filter((i) => i.status === "convertida").length;
  const taxaConv = total > 0 ? Math.round((convertidas / total) * 100) : 0;
  const valorPipeline = indicacoes
    .filter((i) => ["recebida", "contatada", "reuniao"].includes(i.status))
    .reduce((s, i) => s + (i.valorEstimado ?? 0), 0);

  const criar = async () => {
    if (!form.nomeIndicado.trim()) return;
    const res = await fetch("/api/backoffice/indicacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valorEstimado: form.valorEstimado ? Number(form.valorEstimado) : null,
        indicadorId: form.indicadorId || null,
      }),
    });
    if (res.ok) {
      const nova = await res.json();
      const indicador = clientes.find((c) => c.id === form.indicadorId);
      setIndicacoes([
        {
          ...nova,
          criadoEm: nova.criadoEm,
          indicador: indicador
            ? { id: indicador.id, nome: indicador.nome, classificacao: indicador.classificacao }
            : null,
        },
        ...indicacoes,
      ]);
      setForm({
        indicadorId: "",
        nomeIndicado: "",
        emailIndicado: "",
        telefoneIndicado: "",
        valorEstimado: "",
        notas: "",
      });
      setCriando(false);
    }
  };

  const mover = async (id: string, novoStatus: string) => {
    const res = await fetch(`/api/backoffice/indicacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    });
    if (res.ok) {
      setIndicacoes(indicacoes.map((i) => (i.id === id ? { ...i, status: novoStatus } : i)));
    }
  };

  const togglarAgradecimento = async (i: Indicacao) => {
    const res = await fetch(`/api/backoffice/indicacoes/${i.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agradecimentoEnviado: !i.agradecimentoEnviado }),
    });
    if (res.ok) {
      setIndicacoes(
        indicacoes.map((x) =>
          x.id === i.id ? { ...x, agradecimentoEnviado: !x.agradecimentoEnviado } : x
        )
      );
    }
  };

  const remover = async (id: string) => {
    if (!confirm("Remover esta indicação?")) return;
    const res = await fetch(`/api/backoffice/indicacoes/${id}`, { method: "DELETE" });
    if (res.ok) setIndicacoes(indicacoes.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total de indicações" value={String(total)} />
        <Kpi label="Convertidas" value={String(convertidas)} />
        <Kpi label="Taxa de conversão" value={`${taxaConv}%`} />
        <Kpi label="Pipeline aberto" value={moeda(valorPipeline)} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Pipeline de indicações</h3>
        <button
          onClick={() => setCriando(!criando)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> Nova indicação
        </button>
      </div>

      {criando && (
        <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              value={form.indicadorId}
              onChange={(e) => setForm({ ...form, indicadorId: e.target.value })}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">Quem indicou (opcional)...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  [{c.classificacao}] {c.nome}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={form.nomeIndicado}
              onChange={(e) => setForm({ ...form, nomeIndicado: e.target.value })}
              placeholder="Nome do indicado *"
              className="px-3 py-2 rounded-lg border bg-background text-sm font-semibold"
            />
            <input
              type="email"
              value={form.emailIndicado}
              onChange={(e) => setForm({ ...form, emailIndicado: e.target.value })}
              placeholder="Email"
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <input
              type="text"
              value={form.telefoneIndicado}
              onChange={(e) => setForm({ ...form, telefoneIndicado: e.target.value })}
              placeholder="Telefone"
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <input
              type="number"
              value={form.valorEstimado}
              onChange={(e) => setForm({ ...form, valorEstimado: e.target.value })}
              placeholder="Valor estimado (R$)"
              className="px-3 py-2 rounded-lg border bg-background text-sm md:col-span-2"
            />
          </div>
          <textarea
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            placeholder="Notas / contexto da indicação..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={criar}
              disabled={!form.nomeIndicado.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Salvar indicação
            </button>
            <button onClick={() => setCriando(false)} className="px-4 py-2 rounded-lg border text-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {COLUNAS.map((col) => {
          const lista = porStatus(col.id);
          const Icone = col.icon;
          return (
            <div key={col.id} className={`rounded-xl border-2 p-3 min-h-[300px] ${col.cor}`}>
              <div className="flex items-center gap-2 mb-3">
                <Icone className="h-4 w-4" />
                <h4 className="font-semibold text-sm">{col.label}</h4>
                <span className="ml-auto text-xs bg-white/60 dark:bg-black/30 px-2 py-0.5 rounded-full">
                  {lista.length}
                </span>
              </div>
              <div className="space-y-2">
                {lista.map((i) => (
                  <div
                    key={i.id}
                    className="rounded-lg bg-white dark:bg-zinc-900 border border-border p-3 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold text-sm">{i.nomeIndicado}</p>
                      <button onClick={() => remover(i.id)} className="opacity-40 hover:opacity-100">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {i.indicador && (
                      <p className="text-muted-foreground mb-1">
                        Por: <span className="font-medium">{i.indicador.nome}</span> [{i.indicador.classificacao}]
                      </p>
                    )}
                    {i.emailIndicado && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {i.emailIndicado}
                      </p>
                    )}
                    {i.telefoneIndicado && (
                      <p className="text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {i.telefoneIndicado}
                      </p>
                    )}
                    {i.valorEstimado != null && (
                      <p className="font-mono font-semibold mt-1">{moeda(i.valorEstimado)}</p>
                    )}
                    {i.notas && (
                      <p className="text-muted-foreground mt-1 italic">{i.notas}</p>
                    )}

                    {/* Ações */}
                    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
                      <select
                        value={i.status}
                        onChange={(e) => mover(i.id, e.target.value)}
                        className="text-[10px] px-1.5 py-1 rounded border bg-background flex-1"
                      >
                        {COLUNAS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => togglarAgradecimento(i)}
                        className={`p-1.5 rounded ${
                          i.agradecimentoEnviado
                            ? "bg-pink-100 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                        title={
                          i.agradecimentoEnviado
                            ? "Agradecimento enviado"
                            : "Marcar agradecimento enviado"
                        }
                      >
                        <Heart className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {lista.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
