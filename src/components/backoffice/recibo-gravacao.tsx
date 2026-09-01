"use client";

import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";

import { type Gravacao } from "@/lib/backoffice/gravacao";

/**
 * Recibo de gravação — o estado de um salvamento, visível.
 *
 * A ficha do cliente tinha dois estados ("salvando" e "salvo!") e nenhum
 * terceiro. Falha de rede, sessão expirada e erro de servidor caíam todos no
 * mesmo lugar: o botão voltava ao normal e nada era dito.
 *
 * Aqui o terceiro estado existe, e ele NÃO some sozinho. "Salvo!" pode
 * desaparecer em dois segundos porque perder esse aviso não custa nada;
 * perder o aviso de falha custa o texto que a pessoa acabou de escrever.
 */
export type EstadoGravacao = "parado" | "gravando" | "gravado" | "falhou";

/**
 * Estado + execução de uma gravação. Fino de propósito: recebe a função que
 * grava em vez de montar a URL, porque os dez pontos da ficha não têm a mesma
 * forma — nove mandam JSON, dois são DELETE sem corpo, e um faz PATCH em
 * outro recurso (`/api/backoffice/metas/:id`, não o cliente). Um hook que
 * tentasse montar a chamada precisaria de exceção para três dos dez.
 */
export function useGravacao() {
  const [estado, setEstado] = useState<EstadoGravacao>("parado");
  const [erro, setErro] = useState<string | null>(null);

  const executar = useCallback(
    async <T,>(chamada: () => Promise<Gravacao<T>>): Promise<T | null> => {
      setEstado("gravando");
      setErro(null);

      const r = await chamada();

      if (!r.ok) {
        setErro(r.motivo);
        setEstado("falhou");
        return null;
      }

      setEstado("gravado");
      // Só o "gravado" se apaga sozinho. O "falhou" fica.
      setTimeout(() => setEstado((atual) => (atual === "gravado" ? "parado" : atual)), 2000);
      return r.dados;
    },
    [],
  );

  const limpar = useCallback(() => {
    setErro(null);
    setEstado("parado");
  }, []);

  return { estado, erro, executar, limpar, gravando: estado === "gravando" };
}

/** Rótulo do botão de salvar, com o estado embutido. */
export function rotuloGravacao(estado: EstadoGravacao, padrao: string): string {
  if (estado === "gravando") return "Salvando...";
  if (estado === "gravado") return "Salvo!";
  if (estado === "falhou") return "Tentar salvar de novo";
  return padrao;
}

/**
 * A faixa de falha. Renderiza nada quando não há erro — pode ficar montada
 * o tempo todo ao lado do botão.
 *
 * `role="alert"` porque a mensagem aparece depois de uma ação da pessoa e
 * precisa ser anunciada por leitor de tela sem que ela vá procurá-la.
 */
export function ReciboGravacao({ erro, aoFechar }: { erro: string | null; aoFechar?: () => void }) {
  if (!erro) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="flex-1">{erro}</span>
      {aoFechar && (
        <button
          type="button"
          onClick={aoFechar}
          className="shrink-0 rounded px-1 text-xs underline underline-offset-2 hover:no-underline focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none"
        >
          Fechar
        </button>
      )}
    </div>
  );
}

/** Ícone de estado para colocar dentro do botão de salvar. */
export function IconeGravacao({ estado }: { estado: EstadoGravacao }) {
  if (estado === "gravando") return <Loader2 className="size-4 animate-spin" aria-hidden />;
  if (estado === "gravado") return <Check className="size-4" aria-hidden />;
  if (estado === "falhou") return <AlertTriangle className="size-4" aria-hidden />;
  return null;
}
