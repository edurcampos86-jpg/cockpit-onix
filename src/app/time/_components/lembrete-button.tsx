"use client";

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { lembrarCadastroPendente } from "@/app/actions/meu-cadastro";
import type { ResultadoLembrete } from "@/lib/lembrete-cadastro";

/**
 * Botão de disparo do lembrete, ao lado do contador de pendências.
 *
 * DOIS PASSOS, sempre. O primeiro clique é dry-run: mostra quem receberia, por
 * qual canal, e quem seria pulado por já ter sido cobrado. Só o segundo envia.
 *
 * Não é excesso de zelo: o disparo manda WhatsApp e e-mail para o time inteiro
 * e não tem desfazer. Um botão de um clique só ao lado de um número é
 * exatamente a forma de acontecer sem querer.
 */

function resumo(r: ResultadoLembrete): string {
  const partes = [
    `${r.pendentes} com pendência`,
    r.whatsappEnviados > 0 && `${r.whatsappEnviados} WhatsApp`,
    r.emailsEnviados > 0 && `${r.emailsEnviados} e-mail`,
    r.pulados.length > 0 && `${r.pulados.length} pulado(s) por cobrança recente`,
    r.semCanal.length > 0 && `${r.semCanal.length} sem canal`,
  ].filter(Boolean);
  return partes.join(" · ");
}

export function LembreteButton() {
  const [preview, setPreview] = useState<ResultadoLembrete | null>(null);
  const [enviado, setEnviado] = useState<ResultadoLembrete | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(enviar: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await lembrarCadastroPendente({ enviar });
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      if (enviar) {
        setEnviado(r.resultado);
        setPreview(null);
      } else {
        setPreview(r.resultado);
      }
    });
  }

  if (enviado) {
    return (
      <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Lembrete enviado — {resumo(enviado)}
      </p>
    );
  }

  return (
    <div className="mt-1">
      {!preview ? (
        <button
          type="button"
          onClick={() => rodar(false)}
          disabled={pendente}
          className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <Send className="h-3 w-3" />
          {pendente ? "Conferindo…" : "Lembrar quem está pendente"}
        </button>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
          <p className="text-[10px] text-amber-700 dark:text-amber-400">
            {preview.pendentes === 0
              ? "Ninguém com pendência — nada a enviar."
              : `Vai enviar: ${resumo(preview)}`}
          </p>
          {preview.pulados.length > 0 && (
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Pulados (cobrados nas últimas 72h):{" "}
              {preview.pulados.map((p) => `${p.nome} (${p.vezes}ª)`).join(", ")}
            </p>
          )}
          {preview.semCanal.length > 0 && (
            <p className="mt-0.5 text-[10px] text-destructive">
              Sem telefone NEM e-mail — cutuque à mão: {preview.semCanal.join(", ")}
            </p>
          )}
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => rodar(true)}
              disabled={pendente || preview.pendentes === 0}
              className="rounded-lg bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {pendente ? "Enviando…" : "Confirmar envio"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={pendente}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1 text-[10px] text-destructive">{erro}</p>}
    </div>
  );
}
