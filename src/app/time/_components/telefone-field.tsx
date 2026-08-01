"use client";

import { useState } from "react";
import { normalizarTelefoneZapi } from "@/lib/integrations/telefone";

/**
 * Campo de telefone com máscara e aviso de para que ele serve.
 *
 * Client component isolado — o resto de PessoaForm é server. Só este campo
 * precisa de JS, e a máscara é a razão: o campo era texto puro e guardava
 * literalmente o que fosse digitado, inclusive o formato do próprio
 * placeholder, que até a #269 quebrava o envio via Z-API.
 *
 * A #269 conserta o problema na SAÍDA (normaliza antes de enviar). Aqui a
 * mesma coisa é resolvida na ENTRADA: o que se vê digitado é o que se
 * entende, e o que fica guardado é consistente. As duas camadas se somam —
 * a de saída ainda cobre telefone que entrou por import ou pela API.
 *
 * O aviso existe porque Pessoa.telefone deixou de ser dado cadastral e virou
 * contrato: é por ele que os alertas de risco de evasão chegam. Quem apaga
 * esse campo hoje não tem como saber que está desligando o alerta de alguém.
 */

/** (71) 99735-9025 — máscara brasileira, celular ou fixo. */
function mascarar(valor: string): string {
  const d = valor.replace(/\D+/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function TelefoneField({ defaultValue }: { defaultValue?: string | null }) {
  const [valor, setValor] = useState(() => mascarar(defaultValue ?? ""));

  const digitos = valor.replace(/\D+/g, "").length;
  // 0 é estado neutro (campo vazio, opcional). 10 = fixo, 11 = celular.
  const incompleto = digitos > 0 && digitos < 10;

  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">Telefone</span>
      <input
        name="telefone"
        value={valor}
        onChange={(e) => setValor(mascarar(e.target.value))}
        inputMode="numeric"
        placeholder="(71) 99999-9999"
        className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
      />
      {incompleto ? (
        <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
          Faltam dígitos — um número incompleto não recebe alerta.
        </span>
      ) : (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          Usado para enviar alertas de carteira no WhatsApp
          {digitos >= 10 ? ` · será enviado como ${normalizarTelefoneZapi(valor)}` : ""}
        </span>
      )}
    </label>
  );
}
