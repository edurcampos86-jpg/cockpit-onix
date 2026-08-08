"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Shield, ShieldCheck, Check, Loader2, Wallet, UsersRound, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  salvarPapel,
  criarCarteira,
  atualizarCarteira,
  excluirCarteira,
  adicionarCge,
  removerCge,
  atribuirPapel,
  adicionarApoio,
  removerApoio,
  concederEmpresa,
  revogarEmpresa,
  alternarHerancaEmpresa,
} from "@/app/actions/permissoes";

export type PapelDTO = {
  id: string;
  nome: string;
  isSistema: boolean;
  escopoOperacional: string;
  adminGlobal: boolean;
  permissoes: { area: string; nivel: string }[];
};

export type CarteiraDTO = {
  id: string;
  nome: string;
  donoId: string;
  donoNome: string;
  cges: { id: string; cge: string }[];
  numClientes: number;
  numAcessos: number;
};

export type PessoaDTO = { id: string; nome: string; papelId: string | null };

export type ApoioDTO = { id: string; pessoaId: string; carteiraId: string };

const ESCOPOS = [
  { value: "propria", label: "Própria" },
  { value: "propria_mais_apoio", label: "Própria + apoio" },
  { value: "todas", label: "Todas" },
] as const;

const ESCOPO_LABEL: Record<string, string> = {
  propria: "Própria",
  propria_mais_apoio: "Própria + apoio",
  todas: "Todas",
};

const NIVEIS = [
  { value: "nenhum", label: "—" },
  { value: "membro", label: "Membro" },
  { value: "admin", label: "Admin" },
] as const;

const AREAS = [
  { key: "investimentos", label: "Investimentos" },
  { key: "corretora", label: "Corretora" },
  { key: "imobiliaria", label: "Imobiliária" },
  { key: "qualidade", label: "Qualidade" },
  { key: "configuracoes", label: "Configurações" },
] as const;

const TABS = [
  { id: "papeis", label: "Papéis" },
  { id: "carteiras", label: "Carteiras" },
  { id: "pessoas", label: "Pessoas & Acessos" },
  { id: "empresas", label: "Empresas" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ── Segmented control (padrão de botões do app) ── */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-accent p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ── Editor de um papel ── */
function PapelForm({ papel }: { papel: PapelDTO }) {
  const [escopo, setEscopo] = useState(papel.escopoOperacional);
  const [adminGlobal, setAdminGlobal] = useState(papel.adminGlobal);
  const [matrix, setMatrix] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const a of AREAS) m[a.key] = "nenhum";
    for (const p of papel.permissoes) {
      if (AREAS.some((a) => a.key === p.area)) m[p.area] = p.nivel;
    }
    return m;
  });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const salvar = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await salvarPapel({
        papelId: papel.id,
        escopoOperacional: escopo,
        adminGlobal,
        permissoes: AREAS.map((a) => ({ area: a.key, nivel: matrix[a.key] })),
      });
      setMsg(
        res.ok
          ? { ok: true, text: "Permissões salvas." }
          : { ok: false, text: res.error ?? "Erro ao salvar." },
      );
    });
  };

  return (
    <div className="space-y-6">
      {/* Título do papel (read-only nesta PR — renomear/criar vem na próxima) */}
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          {adminGlobal ? (
            <ShieldCheck className="h-4 w-4 text-primary" />
          ) : (
            <Shield className="h-4 w-4 text-primary" />
          )}
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">{papel.nome}</h3>
          {papel.isSistema && (
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Papel de sistema
            </span>
          )}
        </div>
      </div>

      {/* Admin global + escopo */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Admin global</p>
          <Segmented<string>
            value={adminGlobal ? "sim" : "nao"}
            onChange={(v) => setAdminGlobal(v === "sim")}
            options={[
              { value: "nao", label: "Não" },
              { value: "sim", label: "Sim" },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Acesso administrativo a tudo, ignorando escopo/áreas.
          </p>
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">Escopo operacional</p>
          <Segmented<string> value={escopo} onChange={setEscopo} options={ESCOPOS} />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Que carteiras o papel enxerga (própria · + apoio · todas).
          </p>
        </div>
      </div>

      {/* Matriz área × nível */}
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Permissões por área</p>
        <div className="divide-y divide-border rounded-xl border border-border">
          {AREAS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-foreground">{a.label}</span>
              <Segmented<string>
                size="sm"
                value={matrix[a.key]}
                onChange={(v) => setMatrix((m) => ({ ...m, [a.key]: v }))}
                options={NIVEIS}
              />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium">—</span> sem acesso ·{" "}
          <span className="font-medium">Membro</span> opera ·{" "}
          <span className="font-medium">Admin</span> configura
        </p>
      </div>

      {/* Salvar */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar
        </button>
        {msg && (
          <span
            className={cn(
              "text-sm",
              msg.ok ? "text-green-600 dark:text-green-400" : "text-destructive",
            )}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Aba Papéis: lista + editor ── */
function PapeisTab({ papeis }: { papeis: PapelDTO[] }) {
  const [selectedId, setSelectedId] = useState(papeis[0]?.id ?? "");
  const selected = papeis.find((p) => p.id === selectedId) ?? papeis[0] ?? null;

  if (!selected) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhum papel cadastrado.
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[260px_1fr]">
      {/* Lista à esquerda */}
      <div className="space-y-1">
        {papeis.map((p) => {
          const ativo = p.id === selected.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                ativo
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:bg-accent/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{p.nome}</span>
                {p.adminGlobal && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {ESCOPO_LABEL[p.escopoOperacional] ?? p.escopoOperacional}
                </span>
                {p.isSistema && (
                  <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sistema
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Editor à direita — remonta ao trocar de papel (key) p/ resetar estado */}
      <div className="rounded-xl border border-border bg-card p-6">
        <PapelForm key={selected.id} papel={selected} />
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none";

/* ── Aba Carteiras: lista + criar/editar ── */
function CarteirasTab({ carteiras, pessoas }: { carteiras: CarteiraDTO[]; pessoas: PessoaDTO[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(carteiras[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const selected = carteiras.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
          }}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm font-medium transition-colors",
            creating
              ? "border-primary/50 bg-primary/5 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Plus className="h-4 w-4" /> Nova carteira
        </button>
        <div className="space-y-1">
          {carteiras.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">Nenhuma carteira cadastrada.</p>
          )}
          {carteiras.map((c) => {
            const ativo = !creating && c.id === selected?.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCreating(false);
                  setSelectedId(c.id);
                }}
                className={cn(
                  "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                  ativo ? "border-primary/40 bg-primary/5" : "border-border hover:bg-accent/50",
                )}
              >
                <span className="text-sm font-medium text-foreground">{c.nome}</span>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {c.donoNome} · {c.cges.length} CGE{c.cges.length === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {creating ? (
          <NovaCarteiraForm
            pessoas={pessoas}
            onCreated={(id) => {
              setCreating(false);
              setSelectedId(id);
            }}
            onCancel={() => setCreating(false)}
          />
        ) : selected ? (
          <CarteiraEditor
            key={selected.id}
            carteira={selected}
            pessoas={pessoas}
            onDeleted={() => setSelectedId(null)}
          />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Selecione uma carteira ou crie uma nova.
          </p>
        )}
      </div>
    </div>
  );
}

function NovaCarteiraForm({
  pessoas,
  onCreated,
  onCancel,
}: {
  pessoas: PessoaDTO[];
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [donoId, setDonoId] = useState(pessoas[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const criar = () => {
    setError(null);
    startTransition(async () => {
      const res = await criarCarteira({ nome, donoId });
      if (res.ok && res.id) {
        router.refresh();
        onCreated(res.id);
      } else {
        setError(res.error ?? "Erro ao criar carteira.");
      }
    });
  };

  return (
    <div className="space-y-5">
      <h3 className="text-base font-semibold text-foreground">Nova carteira</h3>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Nome</label>
        <input
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Carteira do Eduardo"
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">Dono</label>
        <select className={inputClass} value={donoId} onChange={(e) => setDonoId(e.target.value)}>
          {pessoas.length === 0 && <option value="">Nenhuma pessoa ativa</option>}
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={criar}
          disabled={pending || !nome.trim() || !donoId}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Criar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </div>
  );
}

function CarteiraEditor({
  carteira,
  pessoas,
  onDeleted,
}: {
  carteira: CarteiraDTO;
  pessoas: PessoaDTO[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(carteira.nome);
  const [donoId, setDonoId] = useState(carteira.donoId);
  const [novoCge, setNovoCge] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const salvar = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await atualizarCarteira({ carteiraId: carteira.id, nome, donoId });
      setMsg(res.ok ? { ok: true, text: "Salvo." } : { ok: false, text: res.error ?? "Erro." });
      if (res.ok) router.refresh();
    });
  };

  const addCge = () => {
    const cge = novoCge.trim();
    if (!cge) return;
    setMsg(null);
    startTransition(async () => {
      const res = await adicionarCge({ carteiraId: carteira.id, cge });
      if (res.ok) {
        setNovoCge("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error ?? "Erro ao adicionar CGE." });
      }
    });
  };

  const delCge = (id: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await removerCge({ cgeId: id });
      if (res.ok) router.refresh();
      else setMsg({ ok: false, text: res.error ?? "Erro ao remover CGE." });
    });
  };

  const excluir = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await excluirCarteira({ carteiraId: carteira.id });
      if (res.ok) {
        router.refresh();
        onDeleted();
      } else {
        setConfirmDel(false);
        setMsg({ ok: false, text: res.error ?? "Erro ao excluir." });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{carteira.nome}</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Nome</label>
          <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Dono</label>
          <select className={inputClass} value={donoId} onChange={(e) => setDonoId(e.target.value)}>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">
          CGEs do BTG{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({carteira.numClientes} cliente{carteira.numClientes === 1 ? "" : "s"} nesta carteira)
          </span>
        </p>
        {carteira.cges.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {carteira.cges.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
              >
                {c.cge}
                <button
                  type="button"
                  onClick={() => delCge(c.id)}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`Remover CGE ${c.cge}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-xs text-muted-foreground">Nenhum CGE nesta carteira.</p>
        )}
        <div className="flex items-center gap-2">
          <input
            className={cn(inputClass, "max-w-[220px]")}
            value={novoCge}
            onChange={(e) => setNovoCge(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCge();
              }
            }}
            placeholder="Novo CGE"
          />
          <button
            type="button"
            onClick={addCge}
            disabled={pending || !novoCge.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent/50 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={salvar}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Salvar
        </button>

        {confirmDel ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Excluir esta carteira?</span>
            <button
              type="button"
              onClick={excluir}
              disabled={pending}
              className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
        )}

        {msg && (
          <span
            className={cn("text-sm", msg.ok ? "text-green-600 dark:text-green-400" : "text-destructive")}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Aba Pessoas & Acessos: papel + apoios por pessoa ── */
const ESCOPO_HINT: Record<string, string> = {
  propria: "vê a própria carteira",
  propria_mais_apoio: "própria + carteiras que apoia",
  todas: "vê todas as carteiras",
};

function PessoaRow({
  pessoa,
  papeis,
  carteiras,
  proprias,
  apoiosDaPessoa,
}: {
  pessoa: PessoaDTO;
  papeis: PapelDTO[];
  carteiras: CarteiraDTO[];
  proprias: CarteiraDTO[];
  apoiosDaPessoa: ApoioDTO[];
}) {
  const router = useRouter();
  const [papelId, setPapelId] = useState<string>(pessoa.papelId ?? "");
  const [novoApoio, setNovoApoio] = useState("");
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const papelAtual = papeis.find((p) => p.id === papelId);
  const hint = papelAtual
    ? papelAtual.adminGlobal
      ? "admin global · vê tudo"
      : ESCOPO_HINT[papelAtual.escopoOperacional] ?? ""
    : "";

  const mudarPapel = (id: string) => {
    setErro(null);
    setPapelId(id);
    startTransition(async () => {
      const res = await atribuirPapel({ pessoaId: pessoa.id, papelId: id || null });
      if (res.ok) router.refresh();
      else setErro(res.error ?? "Erro ao atribuir papel.");
    });
  };

  const addApoio = (carteiraId: string) => {
    if (!carteiraId) return;
    setErro(null);
    setNovoApoio("");
    startTransition(async () => {
      const res = await adicionarApoio({ pessoaId: pessoa.id, carteiraId });
      if (res.ok) router.refresh();
      else setErro(res.error ?? "Erro ao adicionar apoio.");
    });
  };

  const delApoio = (acessoId: string) => {
    setErro(null);
    startTransition(async () => {
      const res = await removerApoio({ acessoId });
      if (res.ok) router.refresh();
      else setErro(res.error ?? "Erro ao remover apoio.");
    });
  };

  const apoiadasIds = new Set(apoiosDaPessoa.map((a) => a.carteiraId));
  const propriasIds = new Set(proprias.map((c) => c.id));
  const disponiveis = carteiras.filter((c) => !apoiadasIds.has(c.id) && !propriasIds.has(c.id));
  const nomeCarteira = (id: string) => carteiras.find((c) => c.id === id)?.nome ?? id;

  return (
    <tr className="border-b border-border align-top last:border-0">
      <td className="px-4 py-3 font-medium text-foreground">{pessoa.nome}</td>
      <td className="px-4 py-3">
        <select
          className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm text-foreground focus-visible:border-ring focus-visible:outline-none disabled:opacity-50"
          value={papelId}
          onChange={(e) => mudarPapel(e.target.value)}
          disabled={pending}
        >
          <option value="">Sem papel</option>
          {papeis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </select>
        {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
        {erro && <div className="mt-1 text-[11px] text-destructive">{erro}</div>}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {proprias.length === 0 ? "—" : proprias.map((c) => c.nome).join(", ")}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {apoiosDaPessoa.length === 0 && (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {apoiosDaPessoa.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              {nomeCarteira(a.carteiraId)}
              <button
                type="button"
                onClick={() => delApoio(a.id)}
                disabled={pending}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                aria-label="Remover apoio"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {disponiveis.length > 0 && (
            <select
              className="rounded-md border border-dashed border-border bg-transparent px-2 py-0.5 text-xs text-muted-foreground focus-visible:outline-none disabled:opacity-50"
              value={novoApoio}
              onChange={(e) => addApoio(e.target.value)}
              disabled={pending}
            >
              <option value="">+ Apoiar…</option>
              {disponiveis.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
    </tr>
  );
}

function PessoasTab({
  pessoas,
  papeis,
  carteiras,
  apoios,
}: {
  pessoas: PessoaDTO[];
  papeis: PapelDTO[];
  carteiras: CarteiraDTO[];
  apoios: ApoioDTO[];
}) {
  if (pessoas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <UsersRound className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
        <p className="text-sm text-muted-foreground">Nenhuma pessoa ativa.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Pessoa</th>
            <th className="px-4 py-2.5 font-medium">Papel</th>
            <th className="px-4 py-2.5 font-medium">Carteira própria</th>
            <th className="px-4 py-2.5 font-medium">Apoia</th>
          </tr>
        </thead>
        <tbody>
          {pessoas.map((p) => (
            <PessoaRow
              key={p.id}
              pessoa={p}
              papeis={papeis}
              carteiras={carteiras}
              proprias={carteiras.filter((c) => c.donoId === p.id)}
              apoiosDaPessoa={apoios.filter((a) => a.pessoaId === p.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type EmpresaDTO = { id: string; nome: string; parentId: string | null };
export type AcessoEmpresaDTO = {
  id: string;
  pessoaId: string;
  empresaId: string;
  incluiDescendentes: boolean;
};

/* ── Aba Empresas: quem enxerga qual empresa do grupo ──
 *
 * Escopo DIFERENTE do de carteiras: carteira decide quais CLIENTES a pessoa vê;
 * empresa decide quais EMPRESAS do grupo ela enxerga (nós do hub e páginas de
 * `/empresas/*`). As duas coexistem sem se falar.
 *
 * A tela precisa dizer em voz alta a consequência da regra não-disruptiva:
 * pessoa sem concessão nenhuma vê TUDO, então a PRIMEIRA concessão é o momento
 * em que ela passa de "vê tudo" para "vê só isto". Sem esse aviso, conceder
 * parece só somar — e na verdade também tira.
 */
function EmpresasTab({
  pessoas,
  empresas,
  acessos,
}: {
  pessoas: PessoaDTO[];
  empresas: EmpresaDTO[];
  acessos: AcessoEmpresaDTO[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [pessoaId, setPessoaId] = useState<string>(pessoas[0]?.id ?? "");
  const [novaEmpresaId, setNovaEmpresaId] = useState<string>("");
  const [novaHeranca, setNovaHeranca] = useState(true);

  const doPessoa = acessos.filter((a) => a.pessoaId === pessoaId);
  const jaTem = new Set(doPessoa.map((a) => a.empresaId));
  const disponiveis = empresas.filter((e) => !jaTem.has(e.id));
  const nomeEmpresa = (id: string) => empresas.find((e) => e.id === id)?.nome ?? id;
  const temFilhas = (id: string) => empresas.some((e) => e.parentId === id);

  const rodar = (fn: () => Promise<{ ok: boolean; error?: string }>, queda: string) => {
    setErro(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setErro(res.error ?? queda);
    });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm text-foreground">
          Quem enxerga qual <strong>empresa</strong> do grupo — os nós do hub e as páginas de{" "}
          <code className="text-xs">/empresas/*</code>. É escopo separado do de carteiras, que
          decide quais <em>clientes</em> a pessoa vê.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong className="text-foreground">Atenção:</strong> quem não tem nenhuma concessão vê{" "}
          <strong>todas</strong> as empresas. A primeira concessão RESTRINGE a pessoa às empresas
          concedidas — conceder não só soma, também tira.
        </p>
      </div>

      {erro && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Pessoa</span>
          <select
            className={inputClass}
            value={pessoaId}
            onChange={(e) => setPessoaId(e.target.value)}
            disabled={pending}
          >
            {pessoas.length === 0 && <option value="">Nenhuma pessoa ativa</option>}
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pessoaId && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-accent/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Empresa</th>
                  <th className="px-4 py-2 text-left">Alcança as empresas abaixo</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {doPessoa.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhuma concessão — esta pessoa vê todas as empresas.
                    </td>
                  </tr>
                )}
                {doPessoa.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {nomeEmpresa(a.empresaId)}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {a.empresaId}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {temFilhas(a.empresaId) ? (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={a.incluiDescendentes}
                            disabled={pending}
                            onChange={(e) =>
                              rodar(
                                () =>
                                  alternarHerancaEmpresa({
                                    acessoId: a.id,
                                    incluiDescendentes: e.target.checked,
                                  }),
                                "Erro ao alterar a herança.",
                              )
                            }
                          />
                          herda
                        </label>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          — não tem empresas abaixo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          rodar(() => revogarEmpresa({ acessoId: a.id }), "Erro ao revogar.")
                        }
                        className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                      >
                        Revogar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Conceder empresa</span>
              <select
                className={inputClass}
                value={novaEmpresaId}
                onChange={(e) => setNovaEmpresaId(e.target.value)}
                disabled={pending || disponiveis.length === 0}
              >
                <option value="">
                  {disponiveis.length === 0 ? "Todas já concedidas" : "Escolha uma empresa"}
                </option>
                {disponiveis.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                    {e.parentId === null && temFilhas(e.id) ? " (raiz do grupo)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={novaHeranca}
                disabled={pending}
                onChange={(e) => setNovaHeranca(e.target.checked)}
              />
              alcança as empresas abaixo
            </label>

            <button
              type="button"
              disabled={pending || !novaEmpresaId}
              onClick={() =>
                rodar(async () => {
                  const res = await concederEmpresa({
                    pessoaId,
                    empresaId: novaEmpresaId,
                    incluiDescendentes: novaHeranca,
                  });
                  if (res.ok) setNovaEmpresaId("");
                  return res;
                }, "Erro ao conceder.")
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Conceder
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PermissoesTabs({
  papeis,
  carteiras,
  pessoas,
  apoios,
  empresas,
  acessosEmpresa,
}: {
  papeis: PapelDTO[];
  carteiras: CarteiraDTO[];
  pessoas: PessoaDTO[];
  apoios: ApoioDTO[];
  empresas: EmpresaDTO[];
  acessosEmpresa: AcessoEmpresaDTO[];
}) {
  const [tab, setTab] = useState<TabId>("papeis");

  return (
    <div className="space-y-5">
      {/* Abas */}
      <div className="inline-flex items-center rounded-lg bg-accent p-0.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "papeis" && <PapeisTab papeis={papeis} />}
      {tab === "carteiras" && <CarteirasTab carteiras={carteiras} pessoas={pessoas} />}
      {tab === "pessoas" && (
        <PessoasTab papeis={papeis} carteiras={carteiras} pessoas={pessoas} apoios={apoios} />
      )}
      {tab === "empresas" && (
        <EmpresasTab pessoas={pessoas} empresas={empresas} acessos={acessosEmpresa} />
      )}
    </div>
  );
}
