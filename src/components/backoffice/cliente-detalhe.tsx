"use client";

import { useState } from "react";
import {
  Heart,
  FileText,
  CheckSquare,
  Target,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Cake,
  Sparkles,
  ClipboardList,
} from "lucide-react";
import { ReferenciaLivro } from "./referencia-livro";
import {
  REF_DESCOBERTA_PROFUNDA,
  REF_ONE_PAGE_PLAN,
  REF_CHECKLIST_ORGANIZACAO,
  REF_MAPA_METAS,
  REF_RCA,
} from "@/lib/backoffice/referencias";

interface Meta {
  id: string;
  titulo: string;
  descricao: string | null;
  prazoData: string | null;
  valorAlvo: number | null;
  status: string;
  categoria: string | null;
}

interface EventoVida {
  id: string;
  tipo: string;
  titulo: string;
  data: string;
  recorrente: boolean;
  notas: string | null;
}

interface Interacao {
  id: string;
  tipo: string;
  assunto: string;
  resumo: string | null;
  data: string;
  rcaNotas: string | null;
}

interface Cliente {
  id: string;
  nome: string;
  classificacao: string;
  saldo: number;
  perfilEmocional: string | null;
  observacoes: string | null;
  perfilDescoberta: Record<string, string | null> | null;
  planoUmaPagina: Record<string, string | number | null> | null;
  checklist: Record<string, boolean | string | null> | null;
  metas: Meta[];
  eventosVida: EventoVida[];
  interacoes: Interacao[];
}

type Tab = "descoberta" | "plano" | "checklist" | "metas" | "eventos" | "perfil" | "rca";

const TABS: { id: Tab; label: string; icon: typeof Heart }[] = [
  { id: "descoberta", label: "Descoberta", icon: Heart },
  { id: "plano", label: "One-Page Plan", icon: FileText },
  { id: "checklist", label: "Organização", icon: CheckSquare },
  { id: "metas", label: "Metas de vida", icon: Target },
  { id: "eventos", label: "Eventos de vida", icon: Cake },
  { id: "perfil", label: "Perfil emocional", icon: Sparkles },
  { id: "rca", label: "RCA / Reuniões", icon: ClipboardList },
];

export function ClienteDetalhe({ cliente: inicial }: { cliente: Cliente }) {
  const [tab, setTab] = useState<Tab>("descoberta");
  const [cliente, setCliente] = useState(inicial);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-border overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "descoberta" && (
        <DescobertaTab
          clienteId={cliente.id}
          inicial={cliente.perfilDescoberta}
          onSave={(p) => setCliente({ ...cliente, perfilDescoberta: p })}
        />
      )}
      {tab === "plano" && (
        <PlanoTab
          clienteId={cliente.id}
          inicial={cliente.planoUmaPagina}
          onSave={(p) => setCliente({ ...cliente, planoUmaPagina: p })}
        />
      )}
      {tab === "checklist" && (
        <ChecklistTab
          clienteId={cliente.id}
          inicial={cliente.checklist}
          onSave={(p) => setCliente({ ...cliente, checklist: p })}
        />
      )}
      {tab === "metas" && (
        <MetasTab
          clienteId={cliente.id}
          metas={cliente.metas}
          onChange={(metas) => setCliente({ ...cliente, metas })}
        />
      )}
      {tab === "eventos" && (
        <EventosTab
          clienteId={cliente.id}
          eventos={cliente.eventosVida}
          onChange={(ev) => setCliente({ ...cliente, eventosVida: ev })}
        />
      )}
      {tab === "perfil" && (
        <PerfilEmocionalTab
          clienteId={cliente.id}
          perfilEmocional={cliente.perfilEmocional}
          observacoes={cliente.observacoes}
          onSave={(p, o) =>
            setCliente({ ...cliente, perfilEmocional: p, observacoes: o })
          }
        />
      )}
      {tab === "rca" && (
        <RcaTab
          clienteId={cliente.id}
          interacoes={cliente.interacoes}
          onChange={(i) => setCliente({ ...cliente, interacoes: i })}
        />
      )}
    </div>
  );
}

// ============ DESCOBERTA ============
const PERGUNTAS_DESCOBERTA: { campo: string; pergunta: string; placeholder: string }[] = [
  {
    campo: "valoresVida",
    pergunta: "O que mais importa na sua vida hoje?",
    placeholder: "Família, liberdade, propósito, segurança...",
  },
  {
    campo: "sonhos",
    pergunta: "Se dinheiro não fosse problema, o que você faria?",
    placeholder: "Sonhos, projetos, lugares, experiências...",
  },
  {
    campo: "medos",
    pergunta: "Qual é o seu maior medo financeiro?",
    placeholder: "Perder patrimônio, faltar para a família, depender de alguém...",
  },
  {
    campo: "legado",
    pergunta: "O que você gostaria de deixar para a próxima geração?",
    placeholder: "Patrimônio, valores, educação, oportunidades...",
  },
  {
    campo: "perguntaMagica",
    pergunta: "Se tudo desse certo, como seria sua vida daqui a 5 anos?",
    placeholder: "Visualize com detalhes — onde, com quem, fazendo o quê...",
  },
  {
    campo: "experienciaPrev",
    pergunta: "Qual sua experiência anterior com investimentos?",
    placeholder: "Boas e más experiências, lições aprendidas...",
  },
  {
    campo: "mentorReferencia",
    pergunta: "Quem você admira em termos financeiros e por quê?",
    placeholder: "Pode ser alguém da família, do mercado, um autor...",
  },
  {
    campo: "familiaSituacao",
    pergunta: "Como é a composição da sua família e dependentes?",
    placeholder: "Cônjuge, filhos, pais, dependentes financeiros...",
  },
];

function DescobertaTab({
  clienteId,
  inicial,
  onSave,
}: {
  clienteId: string;
  inicial: Cliente["perfilDescoberta"];
  onSave: (p: Cliente["perfilDescoberta"]) => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const p of PERGUNTAS_DESCOBERTA) f[p.campo] = (inicial?.[p.campo] as string) ?? "";
    f.linguagemPref = (inicial?.linguagemPref as string) ?? "";
    return f;
  });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/descoberta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const p = await res.json();
        onSave(p);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <ReferenciaLivro
        referencias={REF_DESCOBERTA_PROFUNDA}
        titulo="Descoberta profunda — hemisfério direito (Storyselling)"
      />
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <div>
          <h3 className="font-semibold">Questionário de descoberta profunda</h3>
          <p className="text-xs text-muted-foreground mt-1">
            As respostas são a base emocional do plano. Capture na linguagem do cliente.
          </p>
        </div>

        {PERGUNTAS_DESCOBERTA.map((p) => (
          <div key={p.campo}>
            <label className="text-sm font-medium block mb-1.5">{p.pergunta}</label>
            <textarea
              value={form[p.campo] ?? ""}
              onChange={(e) => setForm({ ...form, [p.campo]: e.target.value })}
              placeholder={p.placeholder}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </div>
        ))}

        <div>
          <label className="text-sm font-medium block mb-1.5">Linguagem preferida</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { id: "tecnica", label: "Técnica" },
              { id: "simples", label: "Simples" },
              { id: "visual", label: "Visual" },
              { id: "narrativa", label: "Narrativa" },
            ].map((l) => (
              <button
                key={l.id}
                onClick={() => setForm({ ...form, linguagemPref: l.id })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  form.linguagemPref === l.id
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar descoberta"}
        </button>
      </div>
    </div>
  );
}

// ============ ONE-PAGE PLAN ============
function PlanoTab({
  clienteId,
  inicial,
  onSave,
}: {
  clienteId: string;
  inicial: Cliente["planoUmaPagina"];
  onSave: (p: Cliente["planoUmaPagina"]) => void;
}) {
  const [form, setForm] = useState({
    visaoFamiliar: (inicial?.visaoFamiliar as string) ?? "",
    objetivoPrincipal: (inicial?.objetivoPrincipal as string) ?? "",
    horizonteAnos: (inicial?.horizonteAnos as number) ?? "",
    perfilRisco: (inicial?.perfilRisco as string) ?? "",
    alocacaoAlvo: (inicial?.alocacaoAlvo as string) ?? "",
    riscosPrincipais: (inicial?.riscosPrincipais as string) ?? "",
    proximosPassos: (inicial?.proximosPassos as string) ?? "",
    resumoExecutivo: (inicial?.resumoExecutivo as string) ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/plano`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const p = await res.json();
        onSave(p);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <ReferenciaLivro referencias={REF_ONE_PAGE_PLAN} titulo="One-Page Financial Plan (Supernova)" />

      {/* Visualização tipo "página única" */}
      <div className="rounded-xl border-2 border-primary/30 bg-card p-6 shadow-sm">
        <div className="text-center mb-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Plano em uma página
          </p>
          <h3 className="text-lg font-bold">Resumo executivo do cliente</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <Bloco label="Visão da família">{form.visaoFamiliar || "—"}</Bloco>
          <Bloco label="Objetivo principal">{form.objetivoPrincipal || "—"}</Bloco>
          <Bloco label="Horizonte">
            {form.horizonteAnos ? `${form.horizonteAnos} anos` : "—"}
          </Bloco>
          <Bloco label="Perfil de risco">{form.perfilRisco || "—"}</Bloco>
          <Bloco label="Alocação alvo">{form.alocacaoAlvo || "—"}</Bloco>
          <Bloco label="Riscos principais">{form.riscosPrincipais || "—"}</Bloco>
          <div className="md:col-span-2">
            <Bloco label="Próximos passos">{form.proximosPassos || "—"}</Bloco>
          </div>
          {form.resumoExecutivo && (
            <div className="md:col-span-2">
              <Bloco label="Resumo executivo">{form.resumoExecutivo}</Bloco>
            </div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <h3 className="font-semibold">Editar plano</h3>
        <Field label="Visão da família">
          <input
            type="text"
            value={form.visaoFamiliar}
            onChange={(e) => setForm({ ...form, visaoFamiliar: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Objetivo principal">
          <input
            type="text"
            value={form.objetivoPrincipal}
            onChange={(e) => setForm({ ...form, objetivoPrincipal: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Horizonte (anos)">
            <input
              type="number"
              value={form.horizonteAnos}
              onChange={(e) => setForm({ ...form, horizonteAnos: e.target.value as unknown as number })}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
          </Field>
          <Field label="Perfil de risco">
            <select
              value={form.perfilRisco}
              onChange={(e) => setForm({ ...form, perfilRisco: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            >
              <option value="">Selecione...</option>
              <option value="conservador">Conservador</option>
              <option value="moderado">Moderado</option>
              <option value="arrojado">Arrojado</option>
            </select>
          </Field>
        </div>
        <Field label="Alocação alvo">
          <input
            type="text"
            value={form.alocacaoAlvo}
            onChange={(e) => setForm({ ...form, alocacaoAlvo: e.target.value })}
            placeholder="Ex: 60% RF / 30% RV / 10% alternativos"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Riscos principais">
          <textarea
            rows={2}
            value={form.riscosPrincipais}
            onChange={(e) => setForm({ ...form, riscosPrincipais: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Próximos passos">
          <textarea
            rows={3}
            value={form.proximosPassos}
            onChange={(e) => setForm({ ...form, proximosPassos: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Resumo executivo">
          <textarea
            rows={3}
            value={form.resumoExecutivo}
            onChange={(e) => setForm({ ...form, resumoExecutivo: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>

        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar plano"}
        </button>
      </div>
    </div>
  );
}

function Bloco({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
        {label}
      </p>
      <p className="text-sm whitespace-pre-wrap">{children}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  );
}

// ============ CHECKLIST ============
const ITENS_CHECKLIST: { campo: string; titulo: string; descricao: string }[] = [
  { campo: "testamento", titulo: "Testamento atualizado", descricao: "Documento formal de vontade." },
  { campo: "seguroVida", titulo: "Seguro de vida adequado", descricao: "Cobertura compatível com dependentes e dívidas." },
  { campo: "planoSucessao", titulo: "Plano de sucessão patrimonial", descricao: "Holding, doação em vida, planejamento sucessório." },
  { campo: "reservaEmergencia", titulo: "Reserva de emergência (6+ meses)", descricao: "Liquidez imediata em caso de imprevistos." },
  { campo: "planoSaude", titulo: "Plano de saúde atualizado", descricao: "Cobertura familiar adequada à idade e necessidades." },
  { campo: "procuracao", titulo: "Procuração / diretivas", descricao: "Procuração para situações de incapacidade." },
  { campo: "inventarioBens", titulo: "Inventário de bens consolidado", descricao: "Lista completa de ativos, passivos e localização." },
  { campo: "beneficiariosAtual", titulo: "Beneficiários atualizados", descricao: "Em apólices, previdência, contas conjuntas." },
  { campo: "declaracaoIR", titulo: "Declaração de IR em dia", descricao: "Sem pendências, com bens declarados corretamente." },
  { campo: "planejamentoTributario", titulo: "Planejamento tributário ativo", descricao: "Estrutura otimizada conforme regime e patrimônio." },
];

function ChecklistTab({
  clienteId,
  inicial,
  onSave,
}: {
  clienteId: string;
  inicial: Cliente["checklist"];
  onSave: (p: Cliente["checklist"]) => void;
}) {
  const [estado, setEstado] = useState<Record<string, boolean>>(() => {
    const e: Record<string, boolean> = {};
    for (const i of ITENS_CHECKLIST) e[i.campo] = !!inicial?.[i.campo];
    return e;
  });
  const [notas, setNotas] = useState<string>((inicial?.notas as string) ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const total = ITENS_CHECKLIST.length;
  const feitos = Object.values(estado).filter(Boolean).length;
  const pct = Math.round((feitos / total) * 100);

  const toggle = (campo: string) => setEstado({ ...estado, [campo]: !estado[campo] });

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}/checklist`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...estado, notas }),
      });
      if (res.ok) {
        const p = await res.json();
        onSave(p);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <ReferenciaLivro
        referencias={REF_CHECKLIST_ORGANIZACAO}
        titulo="Organização total da vida financeira"
      />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Checklist de organização</h3>
            <p className="text-xs text-muted-foreground">
              {feitos} de {total} pilares cobertos
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold">{pct}%</p>
          </div>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden mb-6">
          <div
            className={`h-full transition-all ${
              pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="space-y-2">
          {ITENS_CHECKLIST.map((i) => (
            <button
              key={i.campo}
              onClick={() => toggle(i.campo)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                estado[i.campo]
                  ? "border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
                  : "border-border hover:bg-muted/30"
              }`}
            >
              {estado[i.campo] ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${estado[i.campo] ? "line-through opacity-70" : ""}`}>
                  {i.titulo}
                </p>
                <p className="text-xs text-muted-foreground">{i.descricao}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Notas / pendências
          </label>
          <textarea
            rows={3}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Observações importantes sobre a organização do cliente..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </div>

        <button
          onClick={salvar}
          disabled={salvando}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar checklist"}
        </button>
      </div>
    </div>
  );
}

// ============ METAS ============
function MetasTab({
  clienteId,
  metas: iniciais,
  onChange,
}: {
  clienteId: string;
  metas: Meta[];
  onChange: (m: Meta[]) => void;
}) {
  const [metas, setMetas] = useState<Meta[]>(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    descricao: "",
    categoria: "",
    prazoData: "",
    valorAlvo: "",
  });

  const moeda = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

  const criar = async () => {
    if (!form.titulo.trim()) return;
    const res = await fetch(`/api/backoffice/clientes/${clienteId}/metas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        valorAlvo: form.valorAlvo ? Number(form.valorAlvo) : null,
        prazoData: form.prazoData || null,
      }),
    });
    if (res.ok) {
      const nova = await res.json();
      const novas = [nova, ...metas];
      setMetas(novas);
      onChange(novas);
      setForm({ titulo: "", descricao: "", categoria: "", prazoData: "", valorAlvo: "" });
      setCriando(false);
    }
  };

  const remover = async (id: string) => {
    const res = await fetch(`/api/backoffice/metas/${id}`, { method: "DELETE" });
    if (res.ok) {
      const novas = metas.filter((m) => m.id !== id);
      setMetas(novas);
      onChange(novas);
    }
  };

  const togglarStatus = async (m: Meta) => {
    const novoStatus = m.status === "atingida" ? "ativa" : "atingida";
    const res = await fetch(`/api/backoffice/metas/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    });
    if (res.ok) {
      const atualizada = await res.json();
      const novas = metas.map((x) => (x.id === m.id ? atualizada : x));
      setMetas(novas);
      onChange(novas);
    }
  };

  const corCategoria: Record<string, string> = {
    aposentadoria: "bg-blue-100 text-blue-900 border-blue-300",
    educacao: "bg-purple-100 text-purple-900 border-purple-300",
    imovel: "bg-amber-100 text-amber-900 border-amber-300",
    viagem: "bg-pink-100 text-pink-900 border-pink-300",
    outro: "bg-zinc-100 text-zinc-900 border-zinc-300",
  };

  return (
    <div className="space-y-4">
      <ReferenciaLivro referencias={REF_MAPA_METAS} titulo="Mapa de metas de vida (Storyselling + Supernova)" />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Metas de vida do cliente</h3>
            <p className="text-xs text-muted-foreground">
              {metas.length} {metas.length === 1 ? "meta" : "metas"} cadastradas
            </p>
          </div>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Nova meta
          </button>
        </div>

        {criando && (
          <div className="mb-4 p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título da meta (ex: Aposentar aos 60)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <textarea
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              placeholder="Descrição / o sonho por trás da meta..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={form.categoria}
                onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                <option value="">Categoria...</option>
                <option value="aposentadoria">Aposentadoria</option>
                <option value="educacao">Educação</option>
                <option value="imovel">Imóvel</option>
                <option value="viagem">Viagem</option>
                <option value="outro">Outro</option>
              </select>
              <input
                type="date"
                value={form.prazoData}
                onChange={(e) => setForm({ ...form, prazoData: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
              <input
                type="number"
                value={form.valorAlvo}
                onChange={(e) => setForm({ ...form, valorAlvo: e.target.value })}
                placeholder="Valor alvo (R$)"
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.titulo.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Salvar meta
              </button>
              <button
                onClick={() => setCriando(false)}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metas.map((m) => {
            const cor = corCategoria[m.categoria ?? "outro"] ?? corCategoria.outro;
            const atingida = m.status === "atingida";
            return (
              <div
                key={m.id}
                className={`rounded-lg border-2 p-4 ${cor} ${atingida ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <p className={`font-semibold ${atingida ? "line-through" : ""}`}>{m.titulo}</p>
                    {m.descricao && <p className="text-xs mt-1 opacity-80">{m.descricao}</p>}
                  </div>
                  <button
                    onClick={() => remover(m.id)}
                    className="opacity-50 hover:opacity-100"
                    title="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-3 text-xs">
                  <div>
                    {m.prazoData && (
                      <span className="block">
                        Prazo: {new Date(m.prazoData).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                    {m.valorAlvo != null && (
                      <span className="font-mono font-semibold">{moeda(m.valorAlvo)}</span>
                    )}
                  </div>
                  <button
                    onClick={() => togglarStatus(m)}
                    className="px-2 py-1 rounded bg-white/60 dark:bg-black/30 font-medium"
                  >
                    {atingida ? "Reabrir" : "Marcar atingida"}
                  </button>
                </div>
              </div>
            );
          })}
          {metas.length === 0 && !criando && (
            <p className="md:col-span-2 text-center text-sm text-muted-foreground py-8">
              Nenhuma meta cadastrada. Clique em &quot;Nova meta&quot; para começar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ EVENTOS DE VIDA ============
const TIPOS_EVENTO: { id: string; label: string }[] = [
  { id: "aniversario", label: "Aniversário" },
  { id: "casamento", label: "Casamento" },
  { id: "nascimento", label: "Nascimento" },
  { id: "formatura", label: "Formatura" },
  { id: "outro", label: "Outro" },
];

function EventosTab({
  clienteId,
  eventos: iniciais,
  onChange,
}: {
  clienteId: string;
  eventos: EventoVida[];
  onChange: (e: EventoVida[]) => void;
}) {
  const [eventos, setEventos] = useState(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    tipo: "aniversario",
    titulo: "",
    data: "",
    recorrente: true,
    notas: "",
  });

  const criar = async () => {
    if (!form.titulo.trim() || !form.data) return;
    const res = await fetch(`/api/backoffice/clientes/${clienteId}/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const novo = await res.json();
      const novos = [...eventos, novo].sort(
        (a, b) => new Date(a.data).getTime() - new Date(b.data).getTime()
      );
      setEventos(novos);
      onChange(novos);
      setForm({ tipo: "aniversario", titulo: "", data: "", recorrente: true, notas: "" });
      setCriando(false);
    }
  };

  const remover = async (id: string) => {
    const res = await fetch(`/api/backoffice/eventos/${id}`, { method: "DELETE" });
    if (res.ok) {
      const novos = eventos.filter((e) => e.id !== id);
      setEventos(novos);
      onChange(novos);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-pink-200 bg-pink-50 dark:border-pink-900/50 dark:bg-pink-950/20 p-4">
        <p className="text-sm font-semibold text-pink-900 dark:text-pink-200 mb-1">
          Por que isso importa?
        </p>
        <p className="text-xs text-pink-800/80 dark:text-pink-300/80">
          Lembrar de aniversários, casamentos e nascimentos é o gesto mais barato e mais
          impactante de um assessor Supernova. O cliente A não se lembra do retorno do mês
          — ele se lembra de quem ligou no dia do filho dele.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Eventos de vida</h3>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Novo evento
          </button>
        </div>

        {criando && (
          <div className="mb-4 p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              >
                {TIPOS_EVENTO.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="px-3 py-2 rounded-lg border bg-background text-sm"
              />
            </div>
            <input
              type="text"
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              placeholder="Título (ex: Aniversário do filho João)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.recorrente}
                onChange={(e) => setForm({ ...form, recorrente: e.target.checked })}
              />
              Recorrente (anual)
            </label>
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.titulo.trim() || !form.data}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Salvar evento
              </button>
              <button onClick={() => setCriando(false)} className="px-4 py-2 rounded-lg border text-sm">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {eventos.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20"
            >
              <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center shrink-0">
                <Cake className="h-5 w-5 text-pink-600 dark:text-pink-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{e.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(e.data).toLocaleDateString("pt-BR")} ·{" "}
                  {TIPOS_EVENTO.find((t) => t.id === e.tipo)?.label ?? e.tipo}
                  {e.recorrente && " · anual"}
                </p>
                {e.notas && <p className="text-xs text-muted-foreground mt-1">{e.notas}</p>}
              </div>
              <button onClick={() => remover(e.id)} className="opacity-50 hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {eventos.length === 0 && !criando && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nenhum evento cadastrado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PERFIL EMOCIONAL ============
function PerfilEmocionalTab({
  clienteId,
  perfilEmocional: pInicial,
  observacoes: oInicial,
  onSave,
}: {
  clienteId: string;
  perfilEmocional: string | null;
  observacoes: string | null;
  onSave: (p: string | null, o: string | null) => void;
}) {
  const [perfil, setPerfil] = useState(pInicial ?? "");
  const [obs, setObs] = useState(oInicial ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    setSalvo(false);
    try {
      const res = await fetch(`/api/backoffice/clientes/${clienteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfilEmocional: perfil, observacoes: obs }),
      });
      if (res.ok) {
        onSave(perfil, obs);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      }
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-purple-200 bg-purple-50 dark:border-purple-900/50 dark:bg-purple-950/20 p-4">
        <p className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-1">
          Perfil emocional (Storyselling)
        </p>
        <p className="text-xs text-purple-800/80 dark:text-purple-300/80">
          Capture aqui a forma como o cliente fala, os medos que ele admite, os sonhos que
          ilumina os olhos dele. É a base para escolher a analogia certa em cada conversa.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Field label="Perfil emocional / linguagem do cliente">
          <textarea
            rows={5}
            value={perfil}
            onChange={(e) => setPerfil(e.target.value)}
            placeholder="Como ele fala? O que o emociona? Que palavras ele usa? Que metáforas funcionam?"
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <Field label="Observações gerais">
          <textarea
            rows={4}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Hobbies, time, família, restrições, preferências de contato..."
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
        </Field>
        <button
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar perfil"}
        </button>
      </div>
    </div>
  );
}

// ============ RCA / REUNIÕES ============
const RCA_ROTEIRO = [
  "1. Mudanças de vida desde o último contato",
  "2. Revisão de metas (atingidas, ajustadas, novas)",
  "3. Performance da carteira vs. objetivo",
  "4. Eventos de mercado relevantes para o cliente",
  "5. Pendências de organização (checklist)",
  "6. Indicações que ele queira fazer",
  "7. Próximos passos e data do próximo contato",
];

function RcaTab({
  clienteId,
  interacoes: iniciais,
  onChange,
}: {
  clienteId: string;
  interacoes: Interacao[];
  onChange: (i: Interacao[]) => void;
}) {
  const [interacoes, setInteracoes] = useState(iniciais);
  const [criando, setCriando] = useState(false);
  const [form, setForm] = useState({
    tipo: "reuniao",
    assunto: "",
    resumo: "",
    rcaNotas: "",
  });

  const criar = async () => {
    if (!form.assunto.trim()) return;
    const res = await fetch(`/api/backoffice/clientes/${clienteId}/interacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const nova = await res.json();
      const novas = [nova, ...interacoes];
      setInteracoes(novas);
      onChange(novas);
      setForm({ tipo: "reuniao", assunto: "", resumo: "", rcaNotas: "" });
      setCriando(false);
    }
  };

  return (
    <div className="space-y-4">
      <ReferenciaLivro referencias={REF_RCA} titulo="Rapid Client Assessment (RCA) — Supernova" />

      <div className="rounded-xl border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Roteiro RCA padrão</h3>
            <p className="text-xs text-muted-foreground">
              Use este roteiro nas reuniões trimestrais com clientes A.
            </p>
          </div>
          <button
            onClick={() => setCriando(!criando)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Novo RCA
          </button>
        </div>

        <ol className="space-y-1.5 mb-4">
          {RCA_ROTEIRO.map((item, i) => (
            <li key={i} className="text-sm text-muted-foreground">
              {item}
            </li>
          ))}
        </ol>

        {criando && (
          <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 space-y-3 mb-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "ligacao", label: "Ligação" },
                { id: "reuniao", label: "Reunião" },
                { id: "revisao", label: "Revisão" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setForm({ ...form, tipo: t.id })}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    form.tipo === t.id
                      ? "border-primary bg-primary/10 font-semibold"
                      : "border-border"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.assunto}
              onChange={(e) => setForm({ ...form, assunto: e.target.value })}
              placeholder="Assunto (ex: RCA Q2 2026)"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-semibold"
            />
            <textarea
              value={form.rcaNotas}
              onChange={(e) => setForm({ ...form, rcaNotas: e.target.value })}
              placeholder="Notas estruturadas seguindo o roteiro RCA acima..."
              rows={6}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm font-mono"
            />
            <textarea
              value={form.resumo}
              onChange={(e) => setForm({ ...form, resumo: e.target.value })}
              placeholder="Resumo executivo (1-2 frases)"
              rows={2}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
            />
            <div className="flex gap-2">
              <button
                onClick={criar}
                disabled={!form.assunto.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                Registrar
              </button>
              <button
                onClick={() => setCriando(false)}
                className="px-4 py-2 rounded-lg border text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-4">Histórico de contatos ({interacoes.length})</h3>
        <div className="space-y-3">
          {interacoes.map((i) => (
            <div key={i.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold">{i.assunto}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(i.data).toLocaleDateString("pt-BR")} · {i.tipo}
                </span>
              </div>
              {i.resumo && <p className="text-xs text-muted-foreground mb-2">{i.resumo}</p>}
              {i.rcaNotas && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-primary">Ver notas RCA</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs bg-muted/30 p-2 rounded">
                    {i.rcaNotas}
                  </pre>
                </details>
              )}
            </div>
          ))}
          {interacoes.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">
              Nenhum contato registrado ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
