"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarIcon,
  CheckCircle2,
  FileText,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CADENCIAS_REUNIAO } from "@/lib/cockpit-reuniao/tipos";
import { EVENTO_REUNIAO_IMPORTADA } from "./historico-importacoes-reuniao";

// Mesma sentinela do form manual: Base UI não lida bem com value "" como item.
const PESSOA_NENHUMA = "__nenhuma__";

type PessoaOpcao = { id: string; nome: string };

/** Shape devolvido por POST /api/cockpit-reuniao/extrair. */
type Extracao = {
  data: string | null;
  tipoCadencia: string;
  pautas: string[];
  pendenciasAssessor: string[];
  pendenciasCliente: string[];
  proximosPassos: string[];
  patrimonioSnapshot: {
    totalBtg?: number;
    totalForaBtg?: number;
    totalGeral?: number;
    observacao?: string;
    moeda: "BRL";
  };
};

/** yyyy-mm-dd a partir dos componentes LOCAIS (evita shift de timezone do ISO). */
function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function fmtData(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

/** Parse yyyy-mm-dd → Date LOCAL (sem shift). null se vazio/ inválido. */
function fromYmd(s: string | null): Date | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

/**
 * Valor de patrimônio (input controlado) → inteiro de reais cheios | undefined.
 * Tolerante a separadores: "4.000.000" e "4000000" viram 4000000.
 */
function parseReais(v: string): number | undefined {
  const digitos = v.replace(/\D/g, "");
  if (!digitos) return undefined;
  const n = Number(digitos);
  return Number.isFinite(n) ? n : undefined;
}

/** Formata em BRL com separador de milhar (sem centavos). "" se vazio. */
function fmtBRL(v: string): string {
  const n = parseReais(v);
  if (n === undefined) return "";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Sanity: valor preenchido porém abaixo de R$ 10 mil → provável erro de unidade. */
const SANITY_MIN_REAIS = 10_000;
function pareceUnidadeErrada(v: string): boolean {
  const n = parseReais(v);
  return n !== undefined && n < SANITY_MIN_REAIS;
}

/**
 * Lista editável de textos (mesmo padrão visual do form manual). Diferente dele,
 * aqui o estado é a fonte da verdade — o submit lê do estado, não de hidden inputs.
 */
function ListaEditavel({
  itens,
  setItens,
  placeholder,
}: {
  itens: string[];
  setItens: (next: string[]) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      {itens.map((texto, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={texto}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...itens];
              next[i] = e.target.value;
              setItens(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remover item"
            onClick={() => setItens(itens.filter((_, j) => j !== i))}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setItens([...itens, ""])}
      >
        <Plus /> Adicionar
      </Button>
    </div>
  );
}

/** Campo de patrimônio em reais cheios: input + valor formatado + sanity hint. */
function CampoReais({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const formatado = fmtBRL(value);
  const alertaUnidade = pareceUnidadeErrada(value);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
      />
      {formatado && (
        <p className="text-xs text-muted-foreground tabular-nums">{formatado}</p>
      )}
      {alertaUnidade && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          Parece estar em milhares/milhões, confira a unidade.
        </p>
      )}
    </div>
  );
}

export function ImportarReuniaoForm({
  clienteId,
  pessoas,
}: {
  clienteId: string;
  pessoas: PessoaOpcao[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  // Etapa 1 — fonte (texto colado ou PDF) + extração.
  const [modo, setModo] = useState<"texto" | "pdf">("texto");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [extraido, setExtraido] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Etapa 2 — campos do preview (editáveis).
  const [data, setData] = useState<Date | undefined>(undefined);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const [cadencia, setCadencia] = useState<string>("");
  const [pessoaId, setPessoaId] = useState<string>(PESSOA_NENHUMA);
  const [pautas, setPautas] = useState<string[]>([]);
  const [pendAssessor, setPendAssessor] = useState<string[]>([]);
  const [pendCliente, setPendCliente] = useState<string[]>([]);
  const [proximosPassos, setProximosPassos] = useState<string[]>([]);
  const [totalBtg, setTotalBtg] = useState("");
  const [totalForaBtg, setTotalForaBtg] = useState("");
  const [totalGeral, setTotalGeral] = useState("");
  const [obsPatrimonio, setObsPatrimonio] = useState("");

  const [salvando, startSalvar] = useTransition();

  function resetTudo() {
    setModo("texto");
    setTexto("");
    setArquivo(null);
    setExtraido(false);
    setAviso(null);
    setErro(null);
    setData(undefined);
    setCadencia("");
    setPessoaId(PESSOA_NENHUMA);
    setPautas([]);
    setPendAssessor([]);
    setPendCliente([]);
    setProximosPassos([]);
    setTotalBtg("");
    setTotalForaBtg("");
    setTotalGeral("");
    setObsPatrimonio("");
  }

  const podeExtrair = modo === "pdf" ? !!arquivo : !!texto.trim();

  async function extrair() {
    if (!podeExtrair || extraindo) return;
    setErro(null);
    setExtraindo(true);
    try {
      let res: Response;
      if (modo === "pdf" && arquivo) {
        const fd = new FormData();
        fd.append("file", arquivo);
        if (texto.trim()) fd.append("texto", texto);
        res = await fetch("/api/cockpit-reuniao/extrair", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/cockpit-reuniao/extrair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texto }),
        });
      }
      const json = await res.json();
      if (!res.ok) {
        setErro(json?.error ?? "Não consegui extrair. Tente novamente.");
        return;
      }
      const e = json as Extracao;
      setData(fromYmd(e.data));
      setCadencia(e.tipoCadencia ?? "");
      setPautas(e.pautas ?? []);
      setPendAssessor(e.pendenciasAssessor ?? []);
      setPendCliente(e.pendenciasCliente ?? []);
      setProximosPassos(e.proximosPassos ?? []);
      const p = e.patrimonioSnapshot ?? { moeda: "BRL" };
      setTotalBtg(p.totalBtg != null ? String(p.totalBtg) : "");
      setTotalForaBtg(p.totalForaBtg != null ? String(p.totalForaBtg) : "");
      setTotalGeral(p.totalGeral != null ? String(p.totalGeral) : "");
      setObsPatrimonio(p.observacao ?? "");
      setExtraido(true);
    } catch {
      setErro("Falha de rede ao chamar a extração.");
    } finally {
      setExtraindo(false);
    }
  }

  function salvar() {
    if (!data) return;
    setErro(null);
    startSalvar(async () => {
      const payload = {
        clienteId,
        pessoaId: pessoaId === PESSOA_NENHUMA ? null : pessoaId,
        data: toYmd(data),
        tipoCadencia: cadencia || null,
        pautas,
        pendenciasAssessor: pendAssessor,
        pendenciasCliente: pendCliente,
        proximosPassos,
        textoBruto: texto,
        patrimonioSnapshot: {
          moeda: "BRL" as const,
          totalBtg: parseReais(totalBtg),
          totalForaBtg: parseReais(totalForaBtg),
          totalGeral: parseReais(totalGeral),
          observacao: obsPatrimonio.trim() || undefined,
        },
      };
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      if (modo === "pdf" && arquivo) fd.append("file", arquivo);

      let json: { ok?: boolean; error?: string; pdfNaoArmazenado?: boolean };
      try {
        const res = await fetch("/api/cockpit-reuniao/importar", {
          method: "POST",
          body: fd,
        });
        json = await res.json();
        if (!res.ok || !json.ok) {
          setErro(json?.error ?? "Não consegui salvar. Tente novamente.");
          return;
        }
      } catch {
        setErro("Falha de rede ao salvar.");
        return;
      }
      const semPdf = Boolean(json.pdfNaoArmazenado);
      setOpen(false);
      resetTudo();
      setAviso(
        semPdf
          ? "Reunião salva, mas o PDF não foi armazenado (storage indisponível neste ambiente)."
          : null,
      );
      setSucesso(true);
      window.dispatchEvent(
        new CustomEvent(EVENTO_REUNIAO_IMPORTADA, { detail: { clienteId } }),
      );
      router.refresh();
    });
  }

  // Ao fechar o Sheet, zera tudo (o próximo import começa limpo).
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetTudo();
  }

  useEffect(() => {
    if (!sucesso) return;
    const t = setTimeout(() => {
      setSucesso(false);
      setAviso(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [sucesso]);

  return (
    <div className="flex items-center gap-2">
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger
          render={
            <Button size="sm" variant="outline">
              <Sparkles /> Importar reunião
            </Button>
          }
        />
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Importar reunião</SheetTitle>
            <SheetDescription>
              {extraido
                ? "Revise os campos extraídos pela IA antes de salvar. Nada é gravado até você clicar em “Salvar reunião”."
                : "Cole o resumo do Plaud ou anexe o PDF e deixe a IA extrair os campos."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-5 px-4">
            {!extraido ? (
              /* ── Etapa 1 — fonte: texto colado ou PDF ── */
              <div className="space-y-3">
                {/* Toggle de fonte */}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={modo === "texto" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setModo("texto")}
                  >
                    <FileText /> Colar texto
                  </Button>
                  <Button
                    type="button"
                    variant={modo === "pdf" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setModo("pdf")}
                  >
                    <Upload /> Importar PDF
                  </Button>
                </div>

                {modo === "texto" ? (
                  <div className="space-y-1.5">
                    <Label>Resumo da reunião (Plaud)</Label>
                    <Textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder="Cole aqui o resumo completo da reunião…"
                      className="min-h-60"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label>PDF da reunião (Plaud)</Label>
                    <Input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                    />
                    {arquivo && (
                      <p className="text-xs text-muted-foreground">
                        {arquivo.name} · {(arquivo.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      O PDF original fica registrado no histórico de importações.
                    </p>
                  </div>
                )}

                <Button
                  type="button"
                  className="w-full"
                  disabled={!podeExtrair || extraindo}
                  onClick={extrair}
                >
                  <Sparkles /> {extraindo ? "Extraindo…" : "Extrair com IA"}
                </Button>
              </div>
            ) : (
              /* ── Etapa 2 — preview editável ── */
              <>
                {/* Data */}
                <div className="space-y-1.5">
                  <Label>
                    Data <span className="text-destructive">*</span>
                  </Label>
                  <Popover
                    open={calendarioAberto}
                    onOpenChange={setCalendarioAberto}
                  >
                    <PopoverTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full justify-start font-normal"
                        >
                          <CalendarIcon className="text-muted-foreground" />
                          {data ? (
                            fmtData(data)
                          ) : (
                            <span className="text-muted-foreground">
                              Selecione a data
                            </span>
                          )}
                        </Button>
                      }
                    />
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={data}
                        onSelect={(d) => {
                          setData(d);
                          setCalendarioAberto(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Cadência */}
                <div className="space-y-1.5">
                  <Label>Cadência</Label>
                  <Select
                    value={cadencia}
                    onValueChange={(v) => setCadencia(v ?? "")}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCIAS_REUNIAO.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Quem conduziu */}
                <div className="space-y-1.5">
                  <Label>Quem conduziu</Label>
                  <Select
                    value={pessoaId}
                    onValueChange={(v) => setPessoaId(v ?? PESSOA_NENHUMA)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PESSOA_NENHUMA}>Não informar</SelectItem>
                      {pessoas.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pautas */}
                <div className="space-y-1.5">
                  <Label>Pautas</Label>
                  <ListaEditavel
                    itens={pautas}
                    setItens={setPautas}
                    placeholder="Tópico da pauta"
                  />
                </div>

                {/* Pendências do assessor */}
                <div className="space-y-1.5">
                  <Label>Pendências do assessor</Label>
                  <ListaEditavel
                    itens={pendAssessor}
                    setItens={setPendAssessor}
                    placeholder="O que o assessor ficou de fazer"
                  />
                </div>

                {/* Pendências do cliente */}
                <div className="space-y-1.5">
                  <Label>Pendências do cliente</Label>
                  <ListaEditavel
                    itens={pendCliente}
                    setItens={setPendCliente}
                    placeholder="O que o cliente ficou de fazer"
                  />
                </div>

                {/* Próximos passos */}
                <div className="space-y-1.5">
                  <Label>Próximos passos</Label>
                  <ListaEditavel
                    itens={proximosPassos}
                    setItens={setProximosPassos}
                    placeholder="Próximo passo acordado"
                  />
                </div>

                {/* Patrimônio (em reais cheios) */}
                <div className="space-y-3 rounded-lg border border-dashed border-border/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Patrimônio declarado (em reais)
                  </p>
                  <CampoReais
                    label="Total no BTG (R$)"
                    value={totalBtg}
                    onChange={setTotalBtg}
                  />
                  <CampoReais
                    label="Total fora do BTG (R$)"
                    value={totalForaBtg}
                    onChange={setTotalForaBtg}
                  />
                  <CampoReais
                    label="Total geral (R$)"
                    value={totalGeral}
                    onChange={setTotalGeral}
                  />
                  <div className="space-y-1.5">
                    <Label className="text-xs">Observação</Label>
                    <Input
                      value={obsPatrimonio}
                      onChange={(e) => setObsPatrimonio(e.target.value)}
                      placeholder="Observação sobre o patrimônio"
                    />
                  </div>
                </div>
              </>
            )}

            {erro && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>

          {extraido && (
            <SheetFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setExtraido(false)}
                disabled={salvando}
              >
                Voltar
              </Button>
              <Button type="button" onClick={salvar} disabled={salvando || !data}>
                {salvando ? "Salvando…" : "Salvar reunião"}
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {sucesso && (
        <span className="inline-flex items-center gap-1.5 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" /> Reunião importada
        </span>
      )}
      {sucesso && aviso && (
        <span className="text-xs text-amber-600 dark:text-amber-500">{aviso}</span>
      )}
    </div>
  );
}
