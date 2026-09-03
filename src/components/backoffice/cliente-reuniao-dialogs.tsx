"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Loader2, Phone, Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RegistroRapidoAlvo = {
  clienteId: string;
  clienteNome: string;
  tipo: "contato" | "reuniao";
};

export type ReuniaoManualAlvo = {
  clienteId: string;
  clienteNome: string;
  tipo: "ultima" | "proxima";
  dataAtual: Date | string | null;
  fonteAtual?: string | null;
};

export type DatasReuniaoAtualizadas = {
  ultimaReuniaoAt?: Date | string | null;
  proximaReuniaoAt?: Date | string | null;
  ultimaReuniaoSource?: string | null;
  proximaReuniaoSource?: string | null;
  ultimaReuniaoConfirmadaManualmente?: boolean;
  proximaReuniaoConfirmadaManualmente?: boolean;
};

export type RegistroRapidoSalvo = {
  data: string;
  reuniaoAgregada: {
    data: string | null;
    source: string | null;
    confirmadaManualmente: boolean;
  } | null;
};

function paraYmdLocal(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function hoje(): string {
  return paraYmdLocal(new Date());
}

function amanha(): string {
  const data = new Date();
  data.setDate(data.getDate() + 1);
  return paraYmdLocal(data);
}

function paraInputDate(data: Date | string | null): string {
  if (!data) return "";
  const d = new Date(data);
  return Number.isNaN(d.getTime()) ? "" : paraYmdLocal(d);
}

function dataIso(data: string): string {
  return new Date(`${data}T12:00:00`).toISOString();
}

function dataIsoRegistro(data: string): string {
  return data === hoje() ? new Date().toISOString() : dataIso(data);
}

function dataIsoManual(tipo: "ultima" | "proxima", data: string): string {
  return tipo === "ultima" && data === hoje() ? new Date().toISOString() : dataIso(data);
}

function mensagemErro(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const erro = (payload as { error?: unknown }).error;
    if (typeof erro === "string" && erro.trim()) return erro;
  }
  return fallback;
}

function dadosAtualizados(payload: unknown): DatasReuniaoAtualizadas {
  if (!payload || typeof payload !== "object") return {};
  const raiz = payload as Record<string, unknown>;
  const candidato =
    raiz.cliente && typeof raiz.cliente === "object"
      ? (raiz.cliente as Record<string, unknown>)
      : raiz;
  return candidato as DatasReuniaoAtualizadas;
}

export function RegistroRapidoDialog({
  alvo,
  onOpenChange,
  onSalvo,
}: {
  alvo: RegistroRapidoAlvo | null;
  onOpenChange: (aberto: boolean) => void;
  onSalvo: (registro: RegistroRapidoSalvo) => void;
}) {
  const [data, setData] = useState(hoje);
  const [relato, setRelato] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) return;
    setData(hoje());
    setRelato("");
    setErro(null);
  }, [alvo]);

  async function salvar() {
    if (!alvo || !data || !relato.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/clientes/${alvo.clienteId}/interacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: alvo.tipo === "reuniao" ? "reuniao" : "ligacao",
          canal: alvo.tipo === "reuniao" ? "presencial" : "telefone",
          assunto: alvo.tipo === "reuniao" ? "Reunião realizada" : "Contato realizado",
          resumo: relato.trim(),
          data: dataIsoRegistro(data),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(mensagemErro(json, "Não foi possível registrar. Tente novamente."));
        return;
      }
      const salvoEm =
        json && typeof json === "object" && "data" in json && typeof json.data === "string"
          ? json.data
          : dataIsoRegistro(data);
      const reuniaoAgregada =
        json &&
        typeof json === "object" &&
        "reuniaoAgregada" in json &&
        json.reuniaoAgregada &&
        typeof json.reuniaoAgregada === "object"
          ? (json.reuniaoAgregada as RegistroRapidoSalvo["reuniaoAgregada"])
          : null;
      onSalvo({ data: salvoEm, reuniaoAgregada });
      onOpenChange(false);
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const reuniao = alvo?.tipo === "reuniao";
  const Icon = reuniao ? Presentation : Phone;

  return (
    <Dialog open={alvo !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-busy={salvando}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" aria-hidden />
            Registrar {reuniao ? "reunião" : "contato"}
          </DialogTitle>
          <DialogDescription>
            {alvo?.clienteNome}. Informe quando aconteceu e o que foi tratado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="registro-rapido-data" className="text-sm font-medium">
              Data
            </label>
            <input
              id="registro-rapido-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              max={hoje()}
              disabled={salvando}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="registro-rapido-relato" className="text-sm font-medium">
              O que foi tratado <span aria-hidden>*</span>
            </label>
            <textarea
              id="registro-rapido-relato"
              rows={4}
              required
              autoFocus
              value={relato}
              onChange={(e) => setRelato(e.target.value)}
              disabled={salvando}
              placeholder="Registre os pontos principais e o que ficou combinado."
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </div>
          <p
            role="status"
            aria-live="polite"
            className={erro ? "min-h-5 text-sm text-destructive" : "min-h-5 text-sm text-muted-foreground"}
          >
            {salvando ? "Salvando registro…" : erro}
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void salvar()} disabled={salvando || !data || !relato.trim()}>
            {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Salvar registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReuniaoManualDialog({
  alvo,
  onOpenChange,
  onSalvo,
}: {
  alvo: ReuniaoManualAlvo | null;
  onOpenChange: (aberto: boolean) => void;
  onSalvo: (dados: DatasReuniaoAtualizadas) => void;
}) {
  const [data, setData] = useState("");
  const [relato, setRelato] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!alvo) return;
    setData(paraInputDate(alvo.dataAtual));
    setRelato("");
    setErro(null);
  }, [alvo]);

  async function enviar(method: "PUT" | "DELETE") {
    if (!alvo || (method === "PUT" && (!data || (alvo.tipo === "ultima" && !relato.trim())))) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/backoffice/clientes/${alvo.clienteId}/reunioes/manual`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: alvo.tipo,
          ...(method === "PUT"
            ? { data: dataIsoManual(alvo.tipo, data), relato: relato.trim() || undefined }
            : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(mensagemErro(json, "Não foi possível salvar a reunião manual."));
        return;
      }
      const atualizados = dadosAtualizados(json);
      const campoData = alvo.tipo === "ultima" ? "ultimaReuniaoAt" : "proximaReuniaoAt";
      const campoFonte = alvo.tipo === "ultima" ? "ultimaReuniaoSource" : "proximaReuniaoSource";
      onSalvo({
        ...atualizados,
        ...(campoData in atualizados
          ? {}
          : { [campoData]: method === "PUT" ? dataIsoManual(alvo.tipo, data) : null }),
        ...(campoFonte in atualizados
          ? {}
          : { [campoFonte]: method === "PUT" ? "manual" : null }),
      });
      onOpenChange(false);
    } catch {
      setErro("Falha de rede. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  const ultima = alvo?.tipo === "ultima";

  return (
    <Dialog open={alvo !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-busy={salvando}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Editar {ultima ? "última" : "próxima"} reunião
          </DialogTitle>
          <DialogDescription>
            {alvo?.clienteNome}. Esta informação será identificada como Manual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reuniao-manual-data" className="text-sm font-medium">
              Data
            </label>
            <input
              id="reuniao-manual-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              max={ultima ? hoje() : undefined}
              min={ultima ? undefined : amanha()}
              disabled={salvando}
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reuniao-manual-relato" className="text-sm font-medium">
              {ultima ? "O que foi tratado" : "Objetivo da reunião"}
              {ultima && <span aria-hidden> *</span>}
            </label>
            <textarea
              id="reuniao-manual-relato"
              rows={4}
              required={ultima}
              autoFocus
              value={relato}
              onChange={(e) => setRelato(e.target.value)}
              disabled={salvando}
              placeholder={
                ultima
                  ? "Registre os pontos principais e o que ficou combinado."
                  : "Opcional: pauta ou objetivo previsto."
              }
              className="w-full rounded-md border border-border bg-background px-3 py-2"
            />
          </div>
          <p
            role="status"
            aria-live="polite"
            className={erro ? "min-h-5 text-sm text-destructive" : "min-h-5 text-sm text-muted-foreground"}
          >
            {salvando ? "Salvando reunião…" : erro}
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {alvo?.fonteAtual === "manual" && (
              <Button type="button" variant="ghost" onClick={() => void enviar("DELETE")} disabled={salvando}>
                Remover data manual
              </Button>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void enviar("PUT")}
              disabled={salvando || !data || (ultima && !relato.trim())}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Salvar como manual
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
