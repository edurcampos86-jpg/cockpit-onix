"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, FileCode2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Pergunta = {
  id: string;
  pergunta: string;
  ajuda: string | null;
  obrigatoria: boolean;
};

type Estado =
  | { tipo: "carregando" }
  | {
      tipo: "perguntas";
      resumo: string;
      perguntas: Pergunta[];
      respostas: Record<string, string>;
    }
  | { tipo: "gerando" }
  | { tipo: "pronto"; prompt: string; versao: number | null }
  | { tipo: "erro"; mensagem: string };

export function PromptEntregaModal({
  implementacaoId,
  titulo,
  open,
  onOpenChange,
}: {
  implementacaoId: string | null;
  titulo: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [copiado, setCopiado] = useState(false);
  // Impede uma resposta antiga de substituir o modal de outro item após troca rápida.
  const rodada = useRef(0);

  const buscarPerguntas = useCallback(async (rodadaEsperada = ++rodada.current) => {
    if (!implementacaoId) return;
    setEstado({ tipo: "carregando" });
    setCopiado(false);
    try {
      const res = await fetch(
        `/api/configuracoes/implementacoes/${implementacaoId}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "perguntas" }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        resumoEntendimento?: string;
        perguntas?: Pergunta[];
        error?: string;
      };
      if (!res.ok || !data.perguntas?.length) {
        throw new Error(data.error || "Não consegui preparar as perguntas.");
      }
      if (rodada.current !== rodadaEsperada) return;
      setEstado({
        tipo: "perguntas",
        resumo: data.resumoEntendimento ?? "Vamos completar o pedido.",
        perguntas: data.perguntas,
        respostas: {},
      });
    } catch (err) {
      if (rodada.current !== rodadaEsperada) return;
      setEstado({
        tipo: "erro",
        mensagem: err instanceof Error ? err.message : "Não consegui preparar as perguntas.",
      });
    }
  }, [implementacaoId]);

  useEffect(() => {
    if (!open || !implementacaoId) return;
    const atual = ++rodada.current;
    setEstado({ tipo: "carregando" });
    setCopiado(false);

    async function carregar() {
      try {
        const res = await fetch(
          `/api/configuracoes/implementacoes/${implementacaoId}/prompt`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as {
          prompt?: string | null;
          versaoTemplate?: number | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Não consegui abrir o gerador.");
        if (rodada.current !== atual) return;
        if (data.prompt) {
          setEstado({
            tipo: "pronto",
            prompt: data.prompt,
            versao: data.versaoTemplate ?? null,
          });
          return;
        }
        await buscarPerguntas(atual);
      } catch (err) {
        if (rodada.current !== atual) return;
        setEstado({
          tipo: "erro",
          mensagem: err instanceof Error ? err.message : "Não consegui abrir o gerador.",
        });
      }
    }

    void carregar();
    return () => {
      rodada.current += 1;
    };
  }, [buscarPerguntas, implementacaoId, open]);

  async function gerarPrompt() {
    if (!implementacaoId || estado.tipo !== "perguntas") return;
    const respostas = estado.perguntas.map((p) => ({
      pergunta: p.pergunta,
      resposta: estado.respostas[p.id] ?? "",
    }));
    const atual = ++rodada.current;
    setEstado({ tipo: "gerando" });
    try {
      const res = await fetch(
        `/api/configuracoes/implementacoes/${implementacaoId}/prompt`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "gerar", respostas }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        prompt?: string;
        versaoTemplate?: number;
        error?: string;
      };
      if (!res.ok || !data.prompt) {
        throw new Error(data.error || "Não consegui gerar o prompt.");
      }
      if (rodada.current !== atual) return;
      setEstado({
        tipo: "pronto",
        prompt: data.prompt,
        versao: data.versaoTemplate ?? null,
      });
    } catch (err) {
      if (rodada.current !== atual) return;
      setEstado({
        tipo: "erro",
        mensagem: err instanceof Error ? err.message : "Não consegui gerar o prompt.",
      });
    }
  }

  async function copiar() {
    if (estado.tipo !== "pronto") return;
    try {
      await navigator.clipboard.writeText(estado.prompt);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2_000);
    } catch {
      setCopiado(false);
    }
  }

  const faltamObrigatorias =
    estado.tipo === "perguntas" &&
    estado.perguntas.some(
      (p) => p.obrigatoria && !estado.respostas[p.id]?.trim(),
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode2 className="h-4 w-4 text-primary" />
            Prompt de implementação
          </DialogTitle>
          <DialogDescription className="line-clamp-2">
            {titulo ?? "Complete o pedido e copie o prompt pronto."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto pr-1">
          {(estado.tipo === "carregando" || estado.tipo === "gerando") && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {estado.tipo === "carregando"
                ? "Preparando as perguntas…"
                : "Montando e salvando o prompt…"}
            </div>
          )}

          {estado.tipo === "perguntas" && (
            <div className="space-y-5">
              <p className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                {estado.resumo}
              </p>
              {estado.perguntas.map((pergunta, index) => (
                <div key={pergunta.id} className="space-y-2">
                  <Label htmlFor={`prompt-${pergunta.id}`} className="items-start leading-snug">
                    <span className="text-muted-foreground">{index + 1}.</span>
                    <span>
                      {pergunta.pergunta}
                      {!pergunta.obrigatoria && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          (opcional)
                        </span>
                      )}
                    </span>
                  </Label>
                  <Textarea
                    id={`prompt-${pergunta.id}`}
                    value={estado.respostas[pergunta.id] ?? ""}
                    onChange={(e) => {
                      const valor = e.target.value;
                      setEstado((atual) =>
                        atual.tipo === "perguntas"
                          ? {
                              ...atual,
                              respostas: { ...atual.respostas, [pergunta.id]: valor },
                            }
                          : atual,
                      );
                    }}
                    maxLength={4_000}
                    placeholder={pergunta.ajuda ?? "Escreva sua resposta…"}
                    className="min-h-20 resize-y"
                  />
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Os anexos e o Perfil PAT permanecem dentro do Ecossistema Onix.
              </p>
            </div>
          )}

          {estado.tipo === "pronto" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  Prompt pronto para usar
                </p>
                {estado.versao != null && (
                  <span className="text-xs text-muted-foreground">
                    Template v{estado.versao}
                  </span>
                )}
              </div>
              <Textarea
                readOnly
                value={estado.prompt}
                aria-label="Prompt gerado"
                className="min-h-[min(48vh,520px)] resize-y font-mono text-xs leading-relaxed"
              />
            </div>
          )}

          {estado.tipo === "erro" && (
            <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">{estado.mensagem}</p>
              <Button variant="outline" size="sm" onClick={() => void buscarPerguntas()}>
                Tentar novamente
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {estado.tipo === "perguntas" && (
            <Button disabled={faltamObrigatorias} onClick={() => void gerarPrompt()}>
              <FileCode2 className="h-4 w-4" />
              Gerar prompt
            </Button>
          )}
          {estado.tipo === "pronto" && (
            <>
              <Button variant="outline" onClick={() => void buscarPerguntas()}>
                <RotateCcw className="h-4 w-4" />
                Refazer
              </Button>
              <Button onClick={() => void copiar()}>
                {copiado ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar prompt"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
