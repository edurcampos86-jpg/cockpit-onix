"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2 } from "lucide-react";

type Pessoa = {
  id: string;
  apelido: string | null;
  nomeCompleto: string;
  cpf: string;
};

export function UploadForm({ pessoas }: { pessoas: Pessoa[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [pessoaId, setPessoaId] = useState<string>("");
  const [observacoes, setObservacoes] = useState<string>("");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    contratoArquivoId: string;
    jaExistia: boolean;
    mensagem?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setResultado(null);

    if (!file) {
      setErro("Selecione um PDF");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErro("Arquivo deve ser .pdf");
      return;
    }

    const form = new FormData();
    form.append("file", file);
    if (pessoaId) form.append("pessoaId", pessoaId);
    if (observacoes.trim()) form.append("observacoes", observacoes.trim());

    startTransition(async () => {
      try {
        const res = await fetch("/api/juridico/contratos/upload", {
          method: "POST",
          body: form,
        });
        const json = (await res.json()) as {
          ok?: boolean;
          contratoArquivoId?: string;
          jaExistia?: boolean;
          mensagem?: string;
          error?: string;
          dica?: string;
        };

        if (!res.ok && res.status !== 409) {
          setErro([json.error, json.dica].filter(Boolean).join(" — "));
          return;
        }

        if (!json.contratoArquivoId) {
          setErro("Resposta sem contratoArquivoId");
          return;
        }

        setResultado({
          contratoArquivoId: json.contratoArquivoId,
          jaExistia: Boolean(json.jaExistia),
          mensagem: json.mensagem,
        });

        // Refresh em background pra atualizar a lista
        router.refresh();
      } catch (e) {
        setErro((e as Error).message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6">
      <div className="space-y-1">
        <label className="block text-sm font-medium">PDF do contrato</label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          disabled={isPending}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
        />
        {file && (
          <p className="text-xs text-muted-foreground">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Pessoa <span className="text-muted-foreground">(opcional — pode parear depois)</span>
        </label>
        <select
          value={pessoaId}
          onChange={(e) => setPessoaId(e.target.value)}
          disabled={isPending}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">— sem vínculo —</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.apelido || p.nomeCompleto} (CPF {p.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Observações <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          disabled={isPending}
          rows={3}
          placeholder="Notas internas sobre esse contrato..."
          className="block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !file}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Subindo no B2...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Subir e extrair
          </>
        )}
      </button>

      {erro && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      {resultado && (
        <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-3 text-sm space-y-2">
          <p className="text-green-900 dark:text-green-200">
            {resultado.jaExistia
              ? `⚠ Já existia no cofre — ${resultado.mensagem}`
              : "✅ Contrato armazenado. Claude está extraindo os dados em background (30-60s)."}
          </p>
          <a
            href={`/juridico/contratos/${resultado.contratoArquivoId}`}
            className="text-sm text-primary hover:underline"
          >
            Abrir ficha →
          </a>
        </div>
      )}
    </form>
  );
}
