"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  CADENCIAS_REUNIAO,
  HORIZONTES_PROJETO,
  type ExtracaoRica,
  type HorizonteProjeto,
  type IdentidadeExtraida,
  type FamiliaEntidade,
  type ProjetoEntidade,
  type MetricaEntidade,
  type MemoravelEntidade,
  type SucessaoEntidade,
} from "@/lib/cockpit-reuniao/tipos";
import { EVENTO_REUNIAO_IMPORTADA } from "./historico-importacoes-reuniao";

// Mesma sentinela do form manual: Base UI não lida bem com value "" como item.
const PESSOA_NENHUMA = "__nenhuma__";

type PessoaOpcao = { id: string; nome: string };

/** Shape devolvido por POST /api/cockpit-reuniao/extrair. */
type Extracao = {
  data: string | null;
  dataRetorno: string | null;
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
  // Blocos ricos (1b-2a) — revisados no preview; nesta fase NÃO são gravados.
  identidade: IdentidadeExtraida;
  familia: FamiliaEntidade[];
  projetos: ProjetoEntidade[];
  metricas: MetricaEntidade[];
  memoraveis: MemoravelEntidade[];
  saude: string;
  sucessao: SucessaoEntidade[];
};

// Formas de EDIÇÃO no preview (string-friendly p/ inputs controlados). Idade e
// valores de métrica viram string; a conversão canônica só importará na 1b-2b.
type IdentidadeForm = {
  idade: string;
  profissao: string;
  origem: string;
  estadoCivil: string;
};
type FamiliaForm = {
  chave: string;
  nome: string;
  resumo: string;
  detalhe: string;
  sensivel: boolean;
};
type ProjetoForm = { chave: string; descricao: string; horizonte: string };
type MetricaForm = {
  chave: string;
  modo: "num" | "texto";
  valorNumerico: string;
  valorTexto: string;
};
type MemoravelForm = { chave: string; descricao: string; vence: string };
type SucessaoForm = { chave: string; descricao: string };

/** Atualização imutável de um item de lista por índice. */
function patchAt<T>(arr: T[], i: number, patch: Partial<T>): T[] {
  return arr.map((it, j) => (j === i ? { ...it, ...patch } : it));
}

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

/** Cartão de uma entidade (família/projeto/etc.) com botão remover no topo. */
function CartaoEntidade({
  children,
  onRemover,
}: {
  children: ReactNode;
  onRemover: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border/70 p-3">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Remover"
          onClick={onRemover}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Botão "Adicionar" padronizado dos blocos de entidade. */
function BotaoAdicionar({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus /> {children}
    </Button>
  );
}

/** Input pequeno e secundário para a "chave" estável da entidade. */
function CampoChave({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">chave</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-xs"
      />
    </div>
  );
}

/** Identidade do cliente: idade / profissão / origem / estado civil. */
function CampoIdentidade({
  value,
  setValue,
}: {
  value: IdentidadeForm;
  setValue: (next: IdentidadeForm) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label className="text-xs">Idade</Label>
        <Input
          inputMode="numeric"
          value={value.idade}
          onChange={(e) => setValue({ ...value, idade: e.target.value })}
          placeholder="—"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Estado civil</Label>
        <Input
          value={value.estadoCivil}
          onChange={(e) => setValue({ ...value, estadoCivil: e.target.value })}
          placeholder="—"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Profissão</Label>
        <Input
          value={value.profissao}
          onChange={(e) => setValue({ ...value, profissao: e.target.value })}
          placeholder="—"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Origem</Label>
        <Input
          value={value.origem}
          onChange={(e) => setValue({ ...value, origem: e.target.value })}
          placeholder="—"
        />
      </div>
    </div>
  );
}

/** Lista de pessoas da família (nome + resumo + detalhe + sensível). */
function EditorFamilia({
  itens,
  setItens,
}: {
  itens: FamiliaForm[];
  setItens: (next: FamiliaForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((f, i) => (
        <CartaoEntidade
          key={i}
          onRemover={() => setItens(itens.filter((_, j) => j !== i))}
        >
          <Input
            value={f.nome}
            onChange={(e) => setItens(patchAt(itens, i, { nome: e.target.value }))}
            placeholder="Nome (ou papel, ex.: esposa)"
          />
          <Input
            value={f.resumo}
            onChange={(e) => setItens(patchAt(itens, i, { resumo: e.target.value }))}
            placeholder="Resumo — quem é / relação"
          />
          <Textarea
            value={f.detalhe}
            onChange={(e) => setItens(patchAt(itens, i, { detalhe: e.target.value }))}
            placeholder="Detalhe (idade, profissão, saúde, estudos…)"
            className="min-h-16"
          />
          <CampoChave
            value={f.chave}
            onChange={(v) => setItens(patchAt(itens, i, { chave: v }))}
            placeholder="familia:gustavo"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={f.sensivel}
              onCheckedChange={(v) =>
                setItens(patchAt(itens, i, { sensivel: v === true }))
              }
            />
            Dado sensível (ex.: saúde de terceiro)
          </label>
        </CartaoEntidade>
      ))}
      <BotaoAdicionar
        onClick={() =>
          setItens([
            ...itens,
            { chave: "", nome: "", resumo: "", detalhe: "", sensivel: false },
          ])
        }
      >
        Adicionar pessoa
      </BotaoAdicionar>
    </div>
  );
}

/** Lista de projetos (descrição + horizonte). */
function EditorProjetos({
  itens,
  setItens,
}: {
  itens: ProjetoForm[];
  setItens: (next: ProjetoForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((p, i) => (
        <CartaoEntidade
          key={i}
          onRemover={() => setItens(itens.filter((_, j) => j !== i))}
        >
          <Input
            value={p.descricao}
            onChange={(e) =>
              setItens(patchAt(itens, i, { descricao: e.target.value }))
            }
            placeholder="Descrição do projeto / objetivo"
          />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Horizonte</Label>
            <Select
              value={p.horizonte}
              onValueChange={(v) =>
                setItens(patchAt(itens, i, { horizonte: v ?? "medio" }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {HORIZONTES_PROJETO.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CampoChave
            value={p.chave}
            onChange={(v) => setItens(patchAt(itens, i, { chave: v }))}
            placeholder="projeto:vender-itacimirim"
          />
        </CartaoEntidade>
      ))}
      <BotaoAdicionar
        onClick={() =>
          setItens([...itens, { chave: "", descricao: "", horizonte: "medio" }])
        }
      >
        Adicionar projeto
      </BotaoAdicionar>
    </div>
  );
}

/** Lista de métricas de fluxo — toggle número (R$) ou texto qualitativo. */
function EditorMetricas({
  itens,
  setItens,
}: {
  itens: MetricaForm[];
  setItens: (next: MetricaForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((m, i) => (
        <CartaoEntidade
          key={i}
          onRemover={() => setItens(itens.filter((_, j) => j !== i))}
        >
          <Input
            value={m.chave}
            onChange={(e) => setItens(patchAt(itens, i, { chave: e.target.value }))}
            placeholder="Chave (ex.: despesaMensal, rendaMensal)"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              size="sm"
              variant={m.modo === "num" ? "default" : "outline"}
              onClick={() => setItens(patchAt(itens, i, { modo: "num" }))}
            >
              Número (R$)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={m.modo === "texto" ? "default" : "outline"}
              onClick={() => setItens(patchAt(itens, i, { modo: "texto" }))}
            >
              Qualitativo
            </Button>
          </div>
          {m.modo === "num" ? (
            <div className="space-y-1">
              <Input
                inputMode="numeric"
                value={m.valorNumerico}
                onChange={(e) =>
                  setItens(patchAt(itens, i, { valorNumerico: e.target.value }))
                }
                placeholder="0"
              />
              {fmtBRL(m.valorNumerico) && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fmtBRL(m.valorNumerico)}
                </p>
              )}
            </div>
          ) : (
            <Input
              value={m.valorTexto}
              onChange={(e) =>
                setItens(patchAt(itens, i, { valorTexto: e.target.value }))
              }
              placeholder="Qualitativo (ex.: muito alta)"
            />
          )}
        </CartaoEntidade>
      ))}
      <BotaoAdicionar
        onClick={() =>
          setItens([
            ...itens,
            { chave: "", modo: "num", valorNumerico: "", valorTexto: "" },
          ])
        }
      >
        Adicionar métrica
      </BotaoAdicionar>
    </div>
  );
}

/** Lista de memoráveis (descrição + data opcional de vencimento). */
function EditorMemoraveis({
  itens,
  setItens,
}: {
  itens: MemoravelForm[];
  setItens: (next: MemoravelForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((m, i) => (
        <CartaoEntidade
          key={i}
          onRemover={() => setItens(itens.filter((_, j) => j !== i))}
        >
          <Input
            value={m.descricao}
            onChange={(e) =>
              setItens(patchAt(itens, i, { descricao: e.target.value }))
            }
            placeholder="Fato memorável (aniversário, hobby, time…)"
          />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">
              Vence (opcional)
            </Label>
            <Input
              type="date"
              value={m.vence}
              onChange={(e) => setItens(patchAt(itens, i, { vence: e.target.value }))}
            />
          </div>
          <CampoChave
            value={m.chave}
            onChange={(v) => setItens(patchAt(itens, i, { chave: v }))}
            placeholder="memoravel:aniversario"
          />
        </CartaoEntidade>
      ))}
      <BotaoAdicionar
        onClick={() => setItens([...itens, { chave: "", descricao: "", vence: "" }])}
      >
        Adicionar memorável
      </BotaoAdicionar>
    </div>
  );
}

/** Lista de sinais de sucessão / cross-sell (chave + descrição). */
function EditorSucessao({
  itens,
  setItens,
}: {
  itens: SucessaoForm[];
  setItens: (next: SucessaoForm[]) => void;
}) {
  return (
    <div className="space-y-2">
      {itens.map((s, i) => (
        <CartaoEntidade
          key={i}
          onRemover={() => setItens(itens.filter((_, j) => j !== i))}
        >
          <Input
            value={s.descricao}
            onChange={(e) =>
              setItens(patchAt(itens, i, { descricao: e.target.value }))
            }
            placeholder="Necessidade / oportunidade (ex.: contratar seguro de vida)"
          />
          <CampoChave
            value={s.chave}
            onChange={(v) => setItens(patchAt(itens, i, { chave: v }))}
            placeholder="produto:seguro-vida"
          />
        </CartaoEntidade>
      ))}
      <BotaoAdicionar
        onClick={() => setItens([...itens, { chave: "", descricao: "" }])}
      >
        Adicionar sinal
      </BotaoAdicionar>
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
  const [dataRetorno, setDataRetorno] = useState<Date | undefined>(undefined);
  const [calRetornoAberto, setCalRetornoAberto] = useState(false);
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

  // Blocos ricos (1b-2a) — revisáveis no preview; NÃO entram no payload de save.
  const IDENTIDADE_VAZIA: IdentidadeForm = {
    idade: "",
    profissao: "",
    origem: "",
    estadoCivil: "",
  };
  const [identidade, setIdentidade] = useState<IdentidadeForm>(IDENTIDADE_VAZIA);
  const [familia, setFamilia] = useState<FamiliaForm[]>([]);
  const [projetos, setProjetos] = useState<ProjetoForm[]>([]);
  const [metricas, setMetricas] = useState<MetricaForm[]>([]);
  const [memoraveis, setMemoraveis] = useState<MemoravelForm[]>([]);
  const [saude, setSaude] = useState("");
  const [sucessao, setSucessao] = useState<SucessaoForm[]>([]);

  const [salvando, startSalvar] = useTransition();

  function resetTudo() {
    setModo("texto");
    setTexto("");
    setArquivo(null);
    setExtraido(false);
    setAviso(null);
    setErro(null);
    setData(undefined);
    setDataRetorno(undefined);
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
    setIdentidade(IDENTIDADE_VAZIA);
    setFamilia([]);
    setProjetos([]);
    setMetricas([]);
    setMemoraveis([]);
    setSaude("");
    setSucessao([]);
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
      setDataRetorno(fromYmd(e.dataRetorno));
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
      // Blocos ricos → formas de edição (string-friendly).
      const id = e.identidade ?? {};
      setIdentidade({
        idade: id.idade != null ? String(id.idade) : "",
        profissao: id.profissao ?? "",
        origem: id.origem ?? "",
        estadoCivil: id.estadoCivil ?? "",
      });
      setFamilia(
        (e.familia ?? []).map((f) => ({
          chave: f.chave ?? "",
          nome: f.nome ?? "",
          resumo: f.resumo ?? "",
          detalhe: f.detalhe ?? "",
          sensivel: f.sensivel === true,
        })),
      );
      setProjetos(
        (e.projetos ?? []).map((p2) => ({
          chave: p2.chave ?? "",
          descricao: p2.descricao ?? "",
          horizonte: p2.horizonte ?? "medio",
        })),
      );
      setMetricas(
        (e.metricas ?? []).map((m) => ({
          chave: m.chave ?? "",
          modo: m.valorNumerico != null ? "num" : "texto",
          valorNumerico: m.valorNumerico != null ? String(m.valorNumerico) : "",
          valorTexto: m.valorTexto ?? "",
        })),
      );
      setMemoraveis(
        (e.memoraveis ?? []).map((m) => ({
          chave: m.chave ?? "",
          descricao: m.descricao ?? "",
          vence: m.vence ?? "",
        })),
      );
      setSaude(e.saude ?? "");
      setSucessao(
        (e.sucessao ?? []).map((s) => ({
          chave: s.chave ?? "",
          descricao: s.descricao ?? "",
        })),
      );
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
      // Estado de edição (formas string-friendly) → shape canônico ExtracaoRica.
      // A action revalida defensivamente; aqui só convertemos tipos.
      const idadeNum = parseReais(identidade.idade); // dígitos → inteiro
      const extracaoRica: ExtracaoRica = {
        identidade: {
          idade: idadeNum,
          profissao: identidade.profissao.trim() || undefined,
          origem: identidade.origem.trim() || undefined,
          estadoCivil: identidade.estadoCivil.trim() || undefined,
        },
        familia: familia.map((f) => ({
          chave: f.chave.trim(),
          nome: f.nome.trim(),
          resumo: f.resumo.trim(),
          detalhe: f.detalhe.trim() || undefined,
          sensivel: f.sensivel,
        })),
        projetos: projetos.map((p) => ({
          chave: p.chave.trim(),
          descricao: p.descricao.trim(),
          horizonte: p.horizonte as HorizonteProjeto,
        })),
        metricas: metricas.map((m) =>
          m.modo === "num"
            ? { chave: m.chave.trim(), valorNumerico: parseReais(m.valorNumerico) }
            : { chave: m.chave.trim(), valorTexto: m.valorTexto.trim() || undefined },
        ),
        memoraveis: memoraveis.map((m) => ({
          chave: m.chave.trim(),
          descricao: m.descricao.trim(),
          vence: m.vence || null,
        })),
        saude: saude.trim(),
        sucessao: sucessao.map((s) => ({
          chave: s.chave.trim(),
          descricao: s.descricao.trim(),
        })),
      };
      const payload = {
        clienteId,
        pessoaId: pessoaId === PESSOA_NENHUMA ? null : pessoaId,
        data: toYmd(data),
        dataRetorno: dataRetorno ? toYmd(dataRetorno) : null,
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
        extracaoRica,
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

                {/* Próxima data de retorno — slot próprio (datas saem de "próximos passos") */}
                <div className="space-y-1.5">
                  <Label>Próxima data de retorno</Label>
                  <div className="flex items-center gap-2">
                    <Popover
                      open={calRetornoAberto}
                      onOpenChange={setCalRetornoAberto}
                    >
                      <PopoverTrigger
                        render={
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-start font-normal"
                          >
                            <CalendarIcon className="text-muted-foreground" />
                            {dataRetorno ? (
                              fmtData(dataRetorno)
                            ) : (
                              <span className="text-muted-foreground">
                                Selecione (opcional)
                              </span>
                            )}
                          </Button>
                        }
                      />
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={dataRetorno}
                          onSelect={(d) => {
                            setDataRetorno(d);
                            setCalRetornoAberto(false);
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                    {dataRetorno && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Limpar data de retorno"
                        onClick={() => setDataRetorno(undefined)}
                      >
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Próxima reunião acordada. Datas de retorno ficam aqui — não em
                    “Próximos passos”.
                  </p>
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

                {/* ── Perfil enriquecido (revisão) — blocos ricos da extração ── */}
                <div className="border-t border-border/60 pt-4">
                  <p className="text-sm font-semibold">Perfil enriquecido</p>
                  <p className="text-xs text-muted-foreground">
                    Capturado da reunião para revisão. Edite o que precisar.
                  </p>
                </div>

                {/* Identidade */}
                <div className="space-y-1.5">
                  <Label>Identidade do cliente</Label>
                  <CampoIdentidade value={identidade} setValue={setIdentidade} />
                </div>

                {/* Família */}
                <div className="space-y-1.5">
                  <Label>Família / círculo próximo</Label>
                  <EditorFamilia itens={familia} setItens={setFamilia} />
                </div>

                {/* Projetos */}
                <div className="space-y-1.5">
                  <Label>Projetos / objetivos</Label>
                  <EditorProjetos itens={projetos} setItens={setProjetos} />
                </div>

                {/* Métricas de fluxo */}
                <div className="space-y-1.5">
                  <Label>Métricas de fluxo</Label>
                  <EditorMetricas itens={metricas} setItens={setMetricas} />
                </div>

                {/* Memoráveis */}
                <div className="space-y-1.5">
                  <Label>Memoráveis</Label>
                  <EditorMemoraveis itens={memoraveis} setItens={setMemoraveis} />
                </div>

                {/* Saúde do cliente */}
                <div className="space-y-1.5">
                  <Label>Saúde do cliente</Label>
                  <Textarea
                    value={saude}
                    onChange={(e) => setSaude(e.target.value)}
                    placeholder="Saúde do PRÓPRIO cliente (saúde de familiar vai no card da pessoa, marcado como sensível)"
                    className="min-h-16"
                  />
                </div>

                {/* Sucessão / cross-sell */}
                <div className="space-y-1.5">
                  <Label>Sucessão / cross-sell</Label>
                  <EditorSucessao itens={sucessao} setItens={setSucessao} />
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
