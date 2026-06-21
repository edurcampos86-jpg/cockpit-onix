"use client";

import { useState, useTransition } from "react";
import { Shield, ShieldCheck, Check, Loader2, Wallet, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { salvarPapel } from "@/app/actions/permissoes";

export type PapelDTO = {
  id: string;
  nome: string;
  isSistema: boolean;
  escopoOperacional: string;
  adminGlobal: boolean;
  permissoes: { area: string; nivel: string }[];
};

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

/* ── Placeholder das abas futuras ── */
function EmBreve({
  Icon,
  titulo,
  texto,
}: {
  Icon: typeof Wallet;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
      <Icon className="mx-auto mb-2 h-6 w-6 text-muted-foreground/70" />
      <p className="text-sm font-medium text-foreground">{titulo}</p>
      <p className="mt-1 text-xs text-muted-foreground">{texto}</p>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">
        em breve
      </p>
    </div>
  );
}

export function PermissoesTabs({ papeis }: { papeis: PapelDTO[] }) {
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
      {tab === "carteiras" && (
        <EmBreve
          Icon={Wallet}
          titulo="Carteiras"
          texto="Conjuntos de CGEs e seus donos/apoios."
        />
      )}
      {tab === "pessoas" && (
        <EmBreve
          Icon={UsersRound}
          titulo="Pessoas & Acessos"
          texto="Atribuição de papel e acesso a carteiras por pessoa."
        />
      )}
    </div>
  );
}
