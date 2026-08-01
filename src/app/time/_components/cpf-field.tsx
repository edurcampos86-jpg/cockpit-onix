"use client";

import { useState } from "react";
import { cpfValido, mascararCpf } from "@/lib/backoffice/cpf";

/**
 * Campo de CPF com máscara e conferência dos dígitos verificadores.
 *
 * Client component isolado, como TelefoneField — o resto de PessoaForm segue
 * server. Só este campo precisa de JS, e a razão é a mesma do telefone: o
 * campo era texto puro, guardava o que fosse digitado e não conferia nada
 * além do tamanho.
 *
 * A diferença é o custo do erro. Telefone errado o alerta não chega e alguém
 * acaba percebendo. CPF errado é silencioso nos dois sentidos: um dígito
 * trocado ainda tem 11 dígitos, passa na validação atual, vira chave única no
 * banco — e simplesmente nunca casa com o BTG. Não há tela em que isso
 * apareça; o cruzamento só "não encontra".
 *
 * O aviso aqui é conferência local (módulo 11), não consulta à Receita: pega
 * digitação trocada, não pega CPF válido de outra pessoa.
 */

export function CpfField({ defaultValue }: { defaultValue?: string | null }) {
  const [valor, setValor] = useState(() => mascararCpf(defaultValue ?? ""));

  const digitos = valor.replace(/\D+/g, "").length;
  const completo = digitos === 11;
  const invalido = completo && !cpfValido(valor);

  return (
    <div>
      <label htmlFor="cpf" className="block text-xs font-medium text-muted-foreground mb-1.5">
        CPF *
      </label>
      <input
        id="cpf"
        name="cpf"
        value={valor}
        onChange={(e) => setValor(mascararCpf(e.target.value))}
        inputMode="numeric"
        required
        placeholder="000.000.000-00"
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {invalido ? (
        <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-400">
          Dígitos verificadores não conferem — confira antes de salvar.
        </span>
      ) : (
        <span className="mt-1 block text-[11px] text-muted-foreground">
          Chave de cruzamento com os relatórios do BTG
          {digitos > 0 && !completo ? ` · faltam ${11 - digitos} dígitos` : ""}
        </span>
      )}
    </div>
  );
}
