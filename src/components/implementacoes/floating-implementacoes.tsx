"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Lightbulb,
  X,
  HelpCircle,
  Cog,
  Target,
  CheckCircle2,
  Copy,
  ArrowRight,
} from "lucide-react";
import { criarImplementacao, type CriarState } from "@/app/actions/implementacao";
import { EMPRESAS_IMPLEMENTACOES } from "@/lib/empresas-config";
import { AnexosInput } from "@/components/implementacoes/anexos-input";

const initial: CriarState = { ok: false };

/**
 * Espera antes de perguntar ao servidor por ideias parecidas.
 *
 * 400 ms, e não os 600 do autosave da tela: aqui não se grava nada, então a
 * conta é outra — o custo de disparar cedo demais é uma consulta a mais, não um
 * dado errado no banco. E o aviso só serve se chegar enquanto a pessoa ainda
 * está escrevendo a frase; depois que ela terminou, já não muda o que vai enviar.
 */
const DEBOUNCE_SIMILARES_MS = 400;

type Similar = { id: string; oQue: string; status: string };

/**
 * Avisa que já existe ideia parecida na fila, enquanto a pessoa digita "O quê?".
 *
 * SÓ LEITURA e SEM TRAVA: mostra até 3 e sai da frente. O objetivo não é impedir
 * o envio — é dar à pessoa a chance de abrir a que já existe e reforçar aquela em
 * vez de abrir a quarta redação do mesmo pedido, que é o que acontece hoje porque
 * ninguém rola uma fila de 300 linhas antes de sugerir.
 */
function DuplicatasProvaveis({
  texto,
  empresaId,
}: {
  texto: string;
  empresaId: string;
}) {
  const [similares, setSimilares] = useState<Similar[]>([]);
  const ultimaBusca = useRef(0);

  const termo = texto.trim();
  // Texto curto demais não é consultado NEM exibido. Derivado no render em vez
  // de zerado por efeito: o estado não precisa acompanhar isto, a renderização
  // já sabe responder a partir do próprio texto.
  const curto = termo.length < 8;

  useEffect(() => {
    if (curto) return;

    const t = setTimeout(async () => {
      // Carimbo por disparo: respostas podem voltar fora de ordem, e uma
      // resposta antiga sobrescrevendo a nova mostraria "parecidas" de uma frase
      // que a pessoa já apagou.
      const meu = ++ultimaBusca.current;
      try {
        const res = await fetch(
          `/api/implementacoes/similares?q=${encodeURIComponent(termo)}` +
            `&empresa=${encodeURIComponent(empresaId)}`,
        );
        if (!res.ok) return;
        const d = await res.json();
        if (meu === ultimaBusca.current) setSimilares(d.similares ?? []);
      } catch {
        // Silencioso de propósito: isto é um auxílio. Falhar a busca não pode
        // virar mensagem de erro num formulário que está funcionando.
      }
    }, DEBOUNCE_SIMILARES_MS);

    return () => clearTimeout(t);
  }, [termo, curto, empresaId]);

  if (curto || similares.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        Já tem coisa parecida na fila
      </p>
      <ul className="mt-1.5 space-y-1">
        {similares.map((s) => (
          <li key={s.id} className="text-xs text-muted-foreground">
            <span className="line-clamp-1">{s.oQue}</span>
            <span className="text-[10px] uppercase tracking-wide">{s.status}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Pode enviar assim mesmo — isto é só um aviso.
      </p>
    </div>
  );
}

// Vocabulário do FAB sobre os mesmos valores do modelo (melhoria|erro|ideia).
const TIPOS = [
  { value: "melhoria", label: "Melhoria" },
  { value: "erro", label: "Correção" },
  { value: "ideia", label: "Nova" },
];

/**
 * Form do modal. Remontado a cada abertura (via key) para resetar o useActionState.
 * Reusa a action criarImplementacao com origem=fab (que retorna {ok:true} sem
 * redirecionar) e captura a rota de origem no campo `pagina`.
 */
function SugestaoForm({
  pathname,
  onDone,
  onPendingChange,
  v2 = false,
}: {
  pathname: string;
  onDone: () => void;
  onPendingChange: (pending: boolean) => void;
  /** IMPLEMENTACOES_V2: liga duplicatas, link na confirmação e a microcópia nova. */
  v2?: boolean;
}) {
  const [state, formAction, pending] = useActionState(criarImplementacao, initial);
  const [outraPagina, setOutraPagina] = useState(false);
  // Espelho do "O quê?" só para a busca de parecidas. O campo segue não
  // controlado (o form manda pelo `name`), então isto não muda o envio em nada.
  const [oQueTexto, setOQueTexto] = useState("");
  // A empresa escolhida no seletor acima recorta a busca de parecidas — o
  // endpoint não responde sem ela, de propósito.
  const [empresaSel, setEmpresaSel] = useState(EMPRESAS_IMPLEMENTACOES[0].id);

  // Reporta o envio pro pai bloquear o fechamento enquanto a action roda — evita
  // desmontar o form em voo, perder a confirmação e o usuário reenviar (duplicata).
  useEffect(() => {
    onPendingChange(pending);
  }, [pending, onPendingChange]);

  if (state.ok) {
    return (
      <div className="p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
        <p className="text-sm font-semibold text-foreground">Sugestão enviada!</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Obrigado — sua ideia entrou na fila.
        </p>
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={onDone}
            className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Fechar
          </button>
          {/* Só para quem consegue abrir a triagem — o servidor é que diz. Sem
            * isto, a confirmação ofereceria a metade dos usuários um link que os
            * joga num redirect. */}
          {v2 && state.id && state.podeVerNaTriagem && (
            <Link
              href={`/configuracoes/implementacoes#impl-${state.id}`}
              onClick={onDone}
              className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80 underline-offset-2 hover:underline"
            >
              Ver na fila
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 p-5">
      <input type="hidden" name="origem" value="fab" />

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">Empresa</label>
        <select
          name="empresaId"
          defaultValue={EMPRESAS_IMPLEMENTACOES[0].id}
          onChange={v2 ? (e) => setEmpresaSel(e.target.value) : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {EMPRESAS_IMPLEMENTACOES.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-foreground">Tipo</label>
        <select
          name="tipo"
          defaultValue="melhoria"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Target className="h-4 w-4 text-primary" />
          O quê? <span className="text-destructive">*</span>
        </label>
        <textarea
          name="oQue"
          required
          rows={2}
          onChange={v2 ? (e) => setOQueTexto(e.target.value) : undefined}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="O pedido concreto, em uma frase."
        />
        {v2 && (
          <div className="mt-2">
            <DuplicatasProvaveis texto={oQueTexto} empresaId={empresaSel} />
          </div>
        )}
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Cog className="h-4 w-4 text-primary" />
          Como?
        </label>
        <textarea
          name="como"
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder="Uma ideia de solução (opcional)."
        />
      </div>

      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <HelpCircle className="h-4 w-4 text-primary" />
          Por quê? <span className="text-destructive">*</span>
        </label>
        <textarea
          name="porQue"
          required
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
          placeholder={
            v2
              ? "O que dói hoje, e o que muda se isso for feito."
              : "O problema / a motivação por trás do pedido."
          }
        />
      </div>

      <AnexosInput />

      {/* Página de origem: default = rota atual; toggle revela input pra outra. */}
      <div className="rounded-lg border border-border bg-background/50 px-3 py-2.5">
        {!outraPagina ? (
          <>
            <p className="text-xs text-muted-foreground">Página de origem</p>
            <p className="truncate text-sm font-medium text-foreground">{pathname}</p>
            <input type="hidden" name="pagina" value={pathname} />
            <button
              type="button"
              onClick={() => setOutraPagina(true)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              É para outra página?
            </button>
          </>
        ) : (
          <>
            <label className="mb-1 block text-xs text-muted-foreground">Qual página? (rota)</label>
            <input
              type="text"
              name="pagina"
              defaultValue={pathname}
              placeholder="/empresas/investimentos/clientes"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setOutraPagina(false)}
              className="mt-1 text-xs text-muted-foreground hover:underline"
            >
              Usar a página atual
            </button>
          </>
        )}
      </div>

      {state.error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? "Enviando…" : "Enviar sugestão"}
        </button>
      </div>
    </form>
  );
}

/**
 * FAB global de sugestão de implementação (todo usuário logado), atrás da flag
 * Config DB IMPLEMENTACOES_INLINE. Montado no AppShell ao lado do FloatingChat.
 *
 * Canto inferior DIREITO, empilhado ACIMA do FloatingChat (bottom-24 contra o
 * bottom-6 dele) — os dois dividem a mesma coluna. O comentário anterior dizia
 * "canto inferior esquerdo"; nunca foi verdade, e quem fosse mexer no
 * posicionamento confiando nele erraria o lado.
 */
export function FloatingImplementacoes() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [v2, setV2] = useState(false);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/implementacoes/flag")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.enabled) setEnabled(true);
        if (d?.v2) setV2(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!enabled) return null;

  const abrir = () => {
    setFormKey((k) => k + 1); // remonta o form → reseta useActionState
    setOpen(true);
  };

  // Não fecha enquanto há envio em voo (evita perder a confirmação → duplicata).
  const fechar = () => {
    if (!submitting) setOpen(false);
  };

  return (
    <>
      <button
        onClick={abrir}
        aria-label="Sugerir uma implementação"
        title="Sugerir uma implementação"
        className="fixed bottom-24 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg transition-all hover:bg-primary/90"
        style={{ boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)" }}
      >
        <Lightbulb className="h-6 w-6 text-primary-foreground" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={fechar}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border bg-primary/5 px-5 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                <Lightbulb className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight text-foreground">
                  Sugerir uma implementação
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  conte o que precisa e por que importa
                </p>
              </div>
              <button
                onClick={fechar}
                aria-label="Fechar"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <SugestaoForm
              key={formKey}
              pathname={pathname}
              onDone={fechar}
              onPendingChange={setSubmitting}
              v2={v2}
            />
          </div>
        </div>
      )}
    </>
  );
}
