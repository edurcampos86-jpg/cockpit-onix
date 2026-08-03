"use client";

import { useState, useTransition } from "react";
import { Camera, Check, Phone } from "lucide-react";
import { atualizarMeuTelefone, atualizarMinhaFoto } from "@/app/actions/meu-cadastro";
import { normalizarTelefoneZapi } from "@/lib/integrations/telefone";

/**
 * Formulário de "meu telefone", na própria ficha.
 *
 * Aparece só para a pessoa dona da ficha. É o caminho que torna possível pedir
 * "cada um preenche o seu": antes disso, todo write do /time era admin-only.
 *
 * Mostra o erro do servidor NA TELA em vez de lançar. O resto do /time ainda
 * lança para o error boundary (createPessoaAndRedirect faz isso), mas ali quem
 * está do outro lado é admin, que entende uma tela de erro. Aqui é um colega
 * preenchendo o próprio telefone uma vez — perder o que digitou por causa de um
 * DDD faltando é como o preenchimento não acontece.
 */

/** (71) 99735-9025 — mesma máscara do TelefoneField do formulário de admin. */
function mascarar(valor: string): string {
  const d = valor.replace(/\D+/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function MeuTelefoneForm({ defaultValue }: { defaultValue?: string | null }) {
  const [valor, setValor] = useState(() => mascarar(defaultValue ?? ""));
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, startTransition] = useTransition();

  const digitos = valor.replace(/\D+/g, "").length;
  const completo = digitos === 10 || digitos === 11;

  function onSubmit(formData: FormData) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const r = await atualizarMeuTelefone(formData);
      if (r.ok) setSalvo(true);
      else setErro(r.error);
    });
  }

  return (
    <form action={onSubmit} className="md:col-span-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Phone className="h-3.5 w-3.5 text-primary" />
        {defaultValue ? "Meu telefone" : "Cadastre seu telefone"}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        É por ele que chegam os alertas de carteira no WhatsApp. Só você e o admin
        editam este campo.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          name="telefone"
          value={valor}
          onChange={(e) => {
            setValor(mascarar(e.target.value));
            setSalvo(false);
          }}
          inputMode="numeric"
          placeholder="(71) 99999-9999"
          className="flex-1 min-w-[12rem] rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pendente || !completo}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {erro ? (
        <p className="mt-1.5 text-[11px] text-destructive">{erro}</p>
      ) : salvo ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          Salvo — será enviado como {normalizarTelefoneZapi(valor)}
        </p>
      ) : digitos > 0 && !completo ? (
        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          Faltam dígitos — DDD + número.
        </p>
      ) : null}
    </form>
  );
}


/**
 * Troca da própria foto — mesma porta e mesmos limites do telefone.
 *
 * O `key` no input reseta o campo depois de salvar: sem isso o nome do arquivo
 * antigo fica na tela e dá a impressão de que nada aconteceu.
 */
export function MinhaFotoForm({ temFoto }: { temFoto: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [pendente, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      const r = await atualizarMinhaFoto(formData);
      if (r.ok) {
        setSalvo(true);
        setNonce((n) => n + 1);
      } else {
        setErro(r.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="md:col-span-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <Camera className="h-3.5 w-3.5 text-primary" />
        {temFoto ? "Trocar minha foto" : "Adicionar minha foto"}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        JPG, PNG ou WEBP, até 2 MB. Aparece na listagem do time e nas reuniões.
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          key={nonce}
          type="file"
          name="foto"
          accept="image/jpeg,image/png,image/webp"
          className="flex-1 min-w-[12rem] text-xs file:mr-2 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium"
        />
        <button
          type="submit"
          disabled={pendente}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {pendente ? "Enviando…" : "Enviar"}
        </button>
      </div>

      {erro ? (
        <p className="mt-1.5 text-[11px] text-destructive">{erro}</p>
      ) : salvo ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          Foto atualizada — recarregue a página para vê-la.
        </p>
      ) : null}
    </form>
  );
}
