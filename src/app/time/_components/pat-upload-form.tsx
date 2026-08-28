"use client";

import { useActionState } from "react";
import { Upload, AlertCircle } from "lucide-react";
import { uploadPat, type UploadPatState } from "@/app/actions/pat";
import { MAX_PDF_LABEL } from "@/lib/pat-upload";

/**
 * Form de upload do laudo PAT.
 *
 * É componente de cliente por um motivo só: para a recusa do servidor virar
 * texto na tela. Enquanto era `<form action={uploadPatForm}>` num componente
 * de servidor, qualquer erro — inclusive "arquivo grande demais", que o
 * sistema sabia desde o primeiro clique — chegava como 500 sem mensagem.
 */
export function PatUploadForm({ pessoaId }: { pessoaId: string }) {
  const [state, action, pending] = useActionState<UploadPatState, FormData>(
    uploadPat,
    undefined,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="pessoaId" value={pessoaId} />

      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            PAT Executive (PDF, máx. {MAX_PDF_LABEL})
          </label>
          <input
            type="file"
            name="pdf"
            accept="application/pdf,.pdf"
            required
            disabled={pending}
            className="block w-full text-xs text-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-violet-500 file:text-white file:text-xs file:font-medium hover:file:bg-violet-600 file:cursor-pointer disabled:opacity-60"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <Upload className="h-4 w-4" />
          {pending ? "Extraindo..." : "Enviar e extrair"}
        </button>
      </div>

      {pending && (
        <p className="text-xs text-muted-foreground">
          A extração lê as 15 páginas do laudo e leva alguns instantes. Não feche a ficha.
        </p>
      )}

      {state?.error && (
        <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}
    </form>
  );
}
