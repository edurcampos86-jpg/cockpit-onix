"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, Paperclip, Plus, X } from "lucide-react";
import {
  ANEXO_ACCEPT,
  MAX_ANEXOS,
  MAX_ANEXO_BYTES,
  tipoAnexoPermitido,
} from "@/lib/implementacoes/anexos";

type Pendente = {
  /** id estável só para a UI (key + revoke do objectURL) */
  uid: string;
  file: File;
  previewUrl?: string; // só para imagens
};

let uidSeq = 0;

/**
 * Seletor de anexos (imagem/PDF) reutilizável — modal e página "Nova".
 *
 * Mantém a lista de pendentes em estado React e ESPELHA no <input type="file"
 * name="anexos"> via DataTransfer (input.files = dt.files). Assim o submit do
 * <form action={serverAction}> já carrega todos os arquivos sem interceptar o
 * envio nem montar FormData na mão. Aceita também colar (Ctrl+V) imagem do
 * clipboard. Os limites aqui são só UX — o servidor revalida tudo.
 */
export function AnexosInput() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [itens, setItens] = useState<Pendente[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  // Espelho síncrono pra evitar closure defasado no handler global de paste.
  const itensRef = useRef<Pendente[]>([]);

  // Mantém o <input> em sincronia com o estado (fonte do FormData no submit).
  const sync = useCallback((next: Pendente[]) => {
    const dt = new DataTransfer();
    next.forEach((p) => dt.items.add(p.file));
    if (inputRef.current) inputRef.current.files = dt.files;
    itensRef.current = next;
    setItens(next);
  }, []);

  const adicionar = useCallback(
    (novos: File[]) => {
      setAviso(null);
      const next = [...itensRef.current];
      for (const f of novos) {
        if (next.length >= MAX_ANEXOS) {
          setAviso(`Máximo de ${MAX_ANEXOS} anexos.`);
          break;
        }
        if (!tipoAnexoPermitido(f.type)) {
          setAviso("Só imagem ou PDF.");
          continue;
        }
        if (f.size > MAX_ANEXO_BYTES) {
          setAviso(`"${f.name || "arquivo"}" passa de 10 MB.`);
          continue;
        }
        next.push({
          uid: `a${uidSeq++}`,
          file: f,
          previewUrl: f.type.startsWith("image/")
            ? URL.createObjectURL(f)
            : undefined,
        });
      }
      sync(next);
    },
    [sync],
  );

  const remover = useCallback(
    (uid: string) => {
      const alvo = itensRef.current.find((p) => p.uid === uid);
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl);
      sync(itensRef.current.filter((p) => p.uid !== uid));
      setAviso(null);
    },
    [sync],
  );

  // Colar (Ctrl+V): captura arquivos do clipboard (prints) em qualquer lugar do
  // form. Pastes de texto puro não têm files → ignorados (não atrapalha textareas).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === "file") {
          const f = items[i].getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        adicionar(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [adicionar]);

  // Revoga todos os objectURLs ao desmontar (evita leak).
  useEffect(() => {
    return () => {
      itensRef.current.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });
    };
  }, []);

  const cheio = itens.length >= MAX_ANEXOS;

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Paperclip className="h-4 w-4 text-primary" />
        Anexos
        <span className="text-xs font-normal text-muted-foreground">
          (imagem ou PDF, opcional)
        </span>
        <span
          className={
            "ml-auto text-xs font-medium tabular-nums " +
            (cheio ? "text-primary" : "text-muted-foreground")
          }
        >
          {itens.length}/{MAX_ANEXOS}
        </span>
      </label>

      {/* input real, escondido; é a fonte do FormData (name="anexos") */}
      <input
        ref={inputRef}
        type="file"
        name="anexos"
        multiple
        accept={ANEXO_ACCEPT}
        className="hidden"
        onChange={(e) => adicionar(Array.from(e.target.files ?? []))}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={cheio}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background/50 px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Adicionar arquivos
        <span className="text-xs text-muted-foreground/80">ou cole (Ctrl+V)</span>
      </button>

      {aviso && <p className="mt-1.5 text-xs text-primary">{aviso}</p>}

      {itens.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {itens.map((p) => (
            <li
              key={p.uid}
              className="flex items-center gap-2 rounded-lg border border-border bg-background p-2"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {p.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.previewUrl}
                    alt={p.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : p.file.type === "application/pdf" ? (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {p.file.name || "arquivo"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {(p.file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={() => remover(p.uid)}
                aria-label={`Remover ${p.file.name || "anexo"}`}
                className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
