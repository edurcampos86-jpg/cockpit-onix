"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  Plus,
  Paperclip,
  X,
  Sparkles,
  Loader2,
  Check,
  Info,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { calcRiceScore } from "@/lib/rice";
import { parsePrEntrada } from "@/lib/implementacoes/parse-pr";
import type { MetricasBacklog } from "@/lib/implementacoes/metricas";
import {
  atualizarRice,
  atualizarStatus,
  removerAnexo,
  registrarResultadoSugestaoRice,
  vincularPr,
} from "@/app/actions/implementacao";
import { RiceHelp } from "./rice-help";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type AnexoDTO = {
  id: string;
  nomeArquivo: string;
  contentType: string;
};

export type ImplementacaoDTO = {
  id: string;
  empresaId: string;
  tipo: string;
  porQue: string;
  oQue: string;
  printUrl: string | null;
  // `como` e `createdAt` existem no modelo mas NÃO entram aqui: nenhuma célula
  // desta tabela os renderiza, e a página serializa o DTO inteiro em todo acesso.
  anexos: AnexoDTO[];
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
  score: number | null;
  status: string;
  // Fechamento do loop: o PR que esta sugestao originou.
  prNumero: number | null;
  prUrl: string | null;
  prStatus: string | null;
};

type Eixo = "reach" | "impact" | "confidence" | "effort";

/** Rascunho da sugestão da IA — NÃO está salvo no banco até o usuário confirmar. */
type RiceDraft = {
  reach: string;
  impact: string;
  confidence: string;
  effort: string;
  // Quais eixos ainda têm o valor original da IA (some ao o usuário editar o eixo).
  ia: Record<Eixo, boolean>;
  justificativas: Partial<Record<Eixo, string>> | null;
  confiancaGeral: string | null;
  anexosIgnorados?: string[];
  // Correlaciona o resultado (confirmada/descartada) à linha "sugerida" no log.
  sugestaoLogId: string | null;
};

const EIXOS: Eixo[] = ["reach", "impact", "confidence", "effort"];
/** Eixos que o humano editou no rascunho (perderam o destaque "IA"). */
function eixosEditados(d: RiceDraft): Eixo[] {
  return EIXOS.filter((e) => !d.ia[e]);
}

const GOLD = "#FFB114";

const STATUSES = [
  "triagem",
  "aprovada",
  "em-andamento",
  "concluida",
  "recusada",
] as const;

const STATUS_STYLE: Record<string, string> = {
  triagem: "bg-muted text-muted-foreground",
  aprovada: "bg-primary/15 text-primary",
  "em-andamento": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  concluida: "bg-green-500/15 text-green-600 dark:text-green-400",
  recusada: "bg-destructive/15 text-destructive",
};

const TIPO_LABEL: Record<string, string> = {
  melhoria: "Melhoria",
  erro: "Erro",
  ideia: "Ideia",
};

const CONF_LABEL: Record<string, string> = {
  alta: "Confiança alta",
  media: "Confiança média",
  baixa: "Confiança baixa",
};
const CONF_STYLE: Record<string, string> = {
  alta: "bg-green-500/15 text-green-600 dark:text-green-400",
  media: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  baixa: "bg-destructive/15 text-destructive",
};

/** "" → null; valor não-numérico → null; senão number. */
function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/** Input de RICE salvo: dispara onCommit (→ atualizarRice) no blur. (comportamento original) */
function RiceInput({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");
  return (
    <input
      type="number"
      min={0}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        const n = local === "" ? null : Number(local);
        onCommit(n != null && Number.isNaN(n) ? null : n);
      }}
      className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-center text-xs tabular-nums focus:border-primary focus:outline-none"
    />
  );
}

/**
 * Input de RASCUNHO: controlado pelo estado da sugestão, SEM onBlur e SEM
 * qualquer caminho para atualizarRice. Editar é puramente local até "Confirmar".
 * Borda dourada quando o valor ainda é o sugerido pela IA.
 */
function DraftRiceInput({
  value,
  ia,
  onChange,
}: {
  value: string;
  ia: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-14 rounded-md border px-1.5 py-1 text-center text-xs tabular-nums focus:outline-none",
        ia
          ? "border-[#FFB114] bg-[#FFB114]/10"
          : "border-border bg-background focus:border-primary",
      )}
      style={ia ? { boxShadow: `0 0 0 1px ${GOLD}33` } : undefined}
    />
  );
}

/** "i" com a justificativa da IA daquele eixo. Click (mobile) + title nativo (hover desktop). */
function JustificativaTip({ texto }: { texto: string }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Por que a IA sugeriu este valor"
        title={texto}
        className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-[#FFB114] focus-visible:outline-none"
      >
        <Info className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="center" className="max-w-[240px] text-xs leading-relaxed">
        <p className="text-muted-foreground">
          <span className="font-semibold text-[#FFB114]">Sugestão da IA: </span>
          {texto}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * ROI de backlog. Existe porque o rastreio do PR, sem uma tela que o leia, vira
 * coluna que se preenche e ninguém consulta — o dado não vira decisão.
 *
 * Some quando não há nenhuma entrega ainda: três zeros no topo da página não
 * informam nada e só empurram a fila para baixo. A métrica aparece quando passa
 * a ter o que dizer.
 */
function MetricasBacklogBloco({ m }: { m: MetricasBacklog }) {
  if (m.entregues === 0) return null;

  const itens = [
    { valor: `${m.entregues}/${m.total}`, label: "ideias viraram entrega" },
    { valor: `${m.taxaEntrega}%`, label: "da fila entregue" },
    {
      valor:
        m.leadTimeMedianoDias == null ? "—" : `${m.leadTimeMedianoDias}d`,
      label: "lead time mediano",
    },
    { valor: String(m.comPr - m.entregues), label: "PRs em aberto" },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-4">
      {itens.map((i) => (
        <div key={i.label}>
          <p className="text-lg font-bold tabular-nums text-foreground">
            {i.valor}
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            {i.label}
          </p>
        </div>
      ))}
    </div>
  );
}

const PR_STATUS_STYLE: Record<string, string> = {
  aberta: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  merged: "bg-green-500/15 text-green-600 dark:text-green-400",
  fechada: "bg-muted text-muted-foreground",
};

/**
 * Célula de vínculo com o PR de origem. Sem PR: um "+ PR" discreto que vira
 * input. Com PR: número clicável (quando há URL) + status editável.
 */
function PrCell({
  numero,
  url,
  status,
  onVincular,
  onDesvincular,
}: {
  numero: number | null;
  url: string | null;
  status: string | null;
  onVincular: (numero: number, url: string | null, status: string) => void;
  onDesvincular: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState(false);

  function salvar() {
    const { numero: n, url: u } = parsePrEntrada(texto);
    if (n == null) {
      // Texto vazio = desistiu; texto inválido = erro visível, não silêncio.
      if (texto.trim()) return setErro(true);
      setEditando(false);
      return;
    }
    onVincular(n, u, status ?? "aberta");
    setTexto("");
    setErro(false);
    setEditando(false);
  }

  if (numero == null) {
    if (!editando) {
      return (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-xs font-medium text-muted-foreground hover:text-primary"
        >
          + PR
        </button>
      );
    }
    return (
      <div>
        <input
          autoFocus
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setErro(false);
          }}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") {
              setTexto("");
              setErro(false);
              setEditando(false);
            }
          }}
          placeholder="#123 ou URL"
          className={cn(
            "w-28 rounded-md border bg-background px-1.5 py-1 text-xs focus:outline-none",
            erro ? "border-destructive" : "border-border focus:border-primary",
          )}
        />
        {erro && (
          <p className="mt-0.5 text-[10px] text-destructive">
            Use #123 ou a URL do PR.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-primary hover:underline"
        >
          #{numero}
        </a>
      ) : (
        <span className="text-xs font-semibold text-foreground">#{numero}</span>
      )}
      <div className="flex items-center gap-1">
        <select
          value={status ?? "aberta"}
          onChange={(e) => onVincular(numero, url, e.target.value)}
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
            PR_STATUS_STYLE[status ?? "aberta"] ?? "bg-muted text-muted-foreground",
          )}
        >
          <option value="aberta">aberta</option>
          <option value="merged">merged</option>
          <option value="fechada">fechada</option>
        </select>
        <button
          type="button"
          onClick={onDesvincular}
          aria-label="Desvincular PR"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

export function ImplementacoesList({
  itens,
  empresas,
  ocultadas = 0,
  metricas,
}: {
  itens: ImplementacaoDTO[];
  empresas: { id: string; nome: string }[];
  /** Linhas que existem no banco mas não vieram por causa do teto da página. */
  ocultadas?: number;
  /** ROI de backlog — calculado sobre a fila INTEIRA, não sobre o recorte. */
  metricas: MetricasBacklog;
}) {
  const [rows, setRows] = useState<ImplementacaoDTO[]>(itens);
  const [fEmpresa, setFEmpresa] = useState<string>("todas");
  const [fStatus, setFStatus] = useState<string>("todos");
  // Recorte "ainda sem RICE". Não é um status — é a ausência dos 4 fatores.
  const [soSemRice, setSoSemRice] = useState(false);
  // Lote de sugestão da IA: trava o botão e mostra progresso item a item.
  const [loteAtivo, setLoteAtivo] = useState(false);
  const [loteFeitos, setLoteFeitos] = useState(0);
  const [, startTransition] = useTransition();

  // Rascunhos da IA por linha (NÃO salvos), loading e erro da sugestão por linha.
  const [drafts, setDrafts] = useState<Record<string, RiceDraft>>({});
  const [sugLoading, setSugLoading] = useState<Record<string, boolean>>({});
  const [sugError, setSugError] = useState<Record<string, string | null>>({});

  // Espelho autoritativo do estado mais recente. `rows` no closure de um handler
  // reflete o render que o criou; se vários commits acontecem no MESMO tick (sem
  // re-render entre eles), o closure fica defasado. O ref é atualizado de forma
  // síncrona dentro de cada commit (única origem de mudança de `rows`), então o
  // commit seguinte do mesmo tick já enxerga o valor anterior — evitando que
  // payloads parciais (com fatores ainda nulos) sobrescrevam uns aos outros.
  const rowsRef = useRef(rows);

  /**
   * Linhas do recorte atual de empresa/status, ANTES do recorte "sem RICE" —
   * é sobre esta base que o aviso conta quantas faltam pontuar, senão ligar o
   * recorte zeraria o próprio contador que levou a ligá-lo.
   */
  const noRecorte = useMemo(
    () =>
      rows.filter(
        (r) =>
          (fEmpresa === "todas" || r.empresaId === fEmpresa) &&
          (fStatus === "todos" || r.status === fStatus),
      ),
    [rows, fEmpresa, fStatus],
  );

  const semRice = useMemo(
    () => noRecorte.filter((r) => r.score == null).length,
    [noRecorte],
  );

  /**
   * Quantas o lote de fato chamaria: sem score E sem rascunho aberto. Linha que
   * já tem sugestão na tela esperando confirmação não é rechamada — seria gastar
   * chamada de IA para sobrescrever um rascunho que o usuário ainda não julgou.
   */
  const aPontuarNoRecorte = useMemo(
    () => noRecorte.filter((r) => r.score == null && !drafts[r.id]).length,
    [noRecorte, drafts],
  );

  const visiveis = useMemo(() => {
    const filtered = soSemRice
      ? noRecorte.filter((r) => r.score == null)
      : noRecorte;
    return [...filtered].sort((a, b) => {
      // score desc, nulls por último
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });
  }, [noRecorte, soSemRice]);

  function commitRice(id: string, patch: Partial<ImplementacaoDTO>) {
    // Compõe a partir do estado MAIS RECENTE (ref), não do snapshot do closure.
    const next = rowsRef.current.map((r) => {
      if (r.id !== id) return r;
      const merged = { ...r, ...patch };
      merged.score = calcRiceScore(
        merged.reach,
        merged.impact,
        merged.confidence,
        merged.effort,
      );
      return merged;
    });
    rowsRef.current = next; // visível para o próximo commit do mesmo tick
    setRows(next);

    const row = next.find((r) => r.id === id)!;
    startTransition(() =>
      atualizarRice(id, {
        reach: row.reach,
        impact: row.impact,
        confidence: row.confidence,
        effort: row.effort,
      }),
    );
  }

  function commitStatus(id: string, status: string) {
    const next = rowsRef.current.map((r) =>
      r.id === id ? { ...r, status } : r,
    );
    rowsRef.current = next; // mantém o ref autoritativo entre commits do mesmo tick
    setRows(next);
    startTransition(() => atualizarStatus(id, status));
  }

  /**
   * Vincula/atualiza o PR de origem. Otimista na UI; o servidor e quem carimba
   * prMergedAt (o cliente nao manda data — lead time depende dela ser confiavel).
   */
  function commitPr(
    id: string,
    numero: number | null,
    url: string | null,
    status: string,
  ) {
    const next = rowsRef.current.map((r) =>
      r.id === id
        ? {
            ...r,
            prNumero: numero,
            // URL nova so substitui a antiga quando veio uma; trocar so o
            // status nao pode apagar o link ja salvo.
            prUrl: numero == null ? null : (url ?? r.prUrl),
            prStatus: numero == null ? null : status,
          }
        : r,
    );
    rowsRef.current = next;
    setRows(next);
    const row = next.find((r) => r.id === id)!;
    startTransition(async () => {
      await vincularPr(id, {
        numero,
        url: row.prUrl,
        status,
      });
    });
  }

  // Remove um anexo salvo: otimista na UI, server apaga linha + objeto no B2.
  function removerAnexoRow(implId: string, anexoId: string) {
    if (!confirm("Remover este anexo? Isso apaga o arquivo definitivamente.")) {
      return;
    }
    const next = rowsRef.current.map((r) =>
      r.id === implId
        ? { ...r, anexos: r.anexos.filter((a) => a.id !== anexoId) }
        : r,
    );
    rowsRef.current = next;
    setRows(next);
    startTransition(async () => {
      await removerAnexo(anexoId);
    });
  }

  // ── Fase C: sugestão de RICE pela IA (rascunho, NÃO salva) ────────────────

  /** Chama a rota da IA e PREENCHE o rascunho. Nenhuma escrita no banco aqui. */
  async function sugerirRice(id: string) {
    setSugError((m) => ({ ...m, [id]: null }));
    setSugLoading((m) => ({ ...m, [id]: true }));
    try {
      const res = await fetch(
        `/api/configuracoes/implementacoes/${id}/sugerir-rice`,
        { method: "POST" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || `Falha ao sugerir (HTTP ${res.status}).`);
      }
      const d = (await res.json()) as {
        reach: number;
        impact: number;
        confidence: number;
        effort: number;
        justificativas: Partial<Record<Eixo, string>> | null;
        confiancaGeral: string | null;
        anexosIgnorados?: string[];
        sugestaoLogId: string | null;
      };
      setDrafts((m) => ({
        ...m,
        [id]: {
          reach: String(d.reach ?? ""),
          impact: String(d.impact ?? ""),
          confidence: String(d.confidence ?? ""),
          effort: String(d.effort ?? ""),
          ia: { reach: true, impact: true, confidence: true, effort: true },
          justificativas: d.justificativas ?? null,
          confiancaGeral: d.confiancaGeral ?? null,
          anexosIgnorados: d.anexosIgnorados,
          sugestaoLogId: d.sugestaoLogId ?? null,
        },
      }));
    } catch (e) {
      setSugError((m) => ({
        ...m,
        [id]: e instanceof Error ? e.message : "Erro ao sugerir.",
      }));
    } finally {
      setSugLoading((m) => ({ ...m, [id]: false }));
    }
  }

  /**
   * Sugere RICE para TODAS as linhas sem score do recorte atual.
   *
   * Reusa `sugerirRice` (mesma rota, mesma régua, mesmo log de auditoria) — não
   * há motor em lote nem endpoint novo. O que muda é só o número de cliques:
   * pontuar 20 ideias eram 20 cliques e 20 esperas, e cada chamada baixa os
   * anexos do B2 e passa por visão.
   *
   * SEQUENCIAL de propósito: em paralelo, 20 chamadas simultâneas com anexos
   * grandes é o caminho curto para rate limit da Anthropic — e aí o lote falha
   * inteiro em vez de entregar as primeiras. Cada item preenche seu rascunho
   * assim que volta, então a tela vai enchendo em vez de congelar.
   *
   * NADA é salvo: continua tudo rascunho até o "Confirmar" de cada linha.
   */
  async function sugerirRiceEmLote() {
    if (loteAtivo) return;
    const alvos = visiveis.filter((r) => r.score == null && !drafts[r.id]);
    if (alvos.length === 0) return;

    setLoteAtivo(true);
    setLoteFeitos(0);
    try {
      for (const r of alvos) {
        // sugerirRice já trata o próprio erro por linha (setSugError), então um
        // item que falha não derruba os seguintes.
        await sugerirRice(r.id);
        setLoteFeitos((n) => n + 1);
      }
    } finally {
      setLoteAtivo(false);
    }
  }

  /** Edição manual de um eixo do rascunho — tira o destaque "IA" daquele eixo. */
  function setDraftField(id: string, eixo: Eixo, value: string) {
    setDrafts((m) => {
      const cur = m[id];
      if (!cur) return m;
      return {
        ...m,
        [id]: { ...cur, [eixo]: value, ia: { ...cur.ia, [eixo]: false } },
      };
    });
  }

  function limparDraft(id: string) {
    setDrafts((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
  }

  /** O GATILHO: salva os 4 valores de uma vez (reusa commitRice → atualizarRice). */
  function confirmarDraft(id: string) {
    const d = drafts[id];
    if (!d) return;
    const vals = {
      reach: numOrNull(d.reach),
      impact: numOrNull(d.impact),
      confidence: numOrNull(d.confidence),
      effort: numOrNull(d.effort),
    };
    commitRice(id, vals);
    // Log append-only "confirmada", correlacionado à sugestão (fire-and-forget).
    startTransition(() =>
      registrarResultadoSugestaoRice({
        implementacaoId: id,
        sugestaoLogId: d.sugestaoLogId,
        resultado: "confirmada",
        ...vals,
        confiancaGeral: d.confiancaGeral,
        eixosEditados: eixosEditados(d),
      }),
    );
    limparDraft(id);
  }

  /** Descartar: some o rascunho, campos voltam ao salvo. NADA é gravado no RICE. */
  function descartarDraft(id: string) {
    const d = drafts[id];
    if (d) {
      // Log append-only "descartada", correlacionado à sugestão (fire-and-forget).
      startTransition(() =>
        registrarResultadoSugestaoRice({
          implementacaoId: id,
          sugestaoLogId: d.sugestaoLogId,
          resultado: "descartada",
          reach: numOrNull(d.reach),
          impact: numOrNull(d.impact),
          confidence: numOrNull(d.confidence),
          effort: numOrNull(d.effort),
          confiancaGeral: d.confiancaGeral,
          eixosEditados: eixosEditados(d),
        }),
      );
    }
    limparDraft(id);
    setSugError((m) => ({ ...m, [id]: null }));
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Implementações</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Central Golden Circle · priorização RICE
            <RiceHelp />
          </p>
        </div>
        <Link
          href="/configuracoes/implementacoes/nova?empresa=investimentos"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Nova
        </Link>
      </div>

      <MetricasBacklogBloco m={metricas} />

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={fEmpresa}
          onChange={(e) => setFEmpresa(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="todas">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os status</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>

        {/* Recorte "sem RICE". A ordenação da tabela é score desc com nulls por
         * último, então sugestão recém-criada nasce no RODAPÉ — exatamente onde
         * ninguém olha. Sem este atalho, a ideia nova só é vista por quem rola
         * a fila inteira, e a fila só tende a crescer. */}
        {semRice > 0 && (
          <button
            type="button"
            onClick={() => setSoSemRice((v) => !v)}
            aria-pressed={soSemRice}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
              soSemRice
                ? "border-[#FFB114] bg-[#FFB114]/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FFB114]" />
            {semRice} sem RICE
            {soSemRice && <X className="h-3.5 w-3.5" />}
          </button>
        )}

        {/* Lote só aparece quando há mais de uma linha a pontuar: para UMA
         * linha o botão da própria linha já resolve, e um segundo caminho para
         * a mesma ação só confunde. */}
        {aPontuarNoRecorte > 1 && (
          <button
            type="button"
            onClick={sugerirRiceEmLote}
            disabled={loteAtivo}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent disabled:opacity-60"
          >
            {loteAtivo ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Sugerindo {loteFeitos}/{aPontuarNoRecorte}…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Sugerir RICE para as {aPontuarNoRecorte}
              </>
            )}
          </button>
        )}
      </div>

      {ocultadas > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>{ocultadas}</strong>{" "}
            {ocultadas === 1 ? "sugestão mais antiga não está" : "sugestões mais antigas não estão"}{" "}
            nesta tela — a página traz as {rows.length} de maior score. Os filtros
            abaixo só enxergam o que está carregado.
          </span>
        </div>
      )}

      {visiveis.length === 0 ? (
        /* Duas mensagens, porque são dois problemas diferentes: fila vazia de
         * verdade pede "crie a primeira"; filtro que não casou pede "limpe o
         * filtro". O texto único dizia "Nenhuma implementação ainda" com 40
         * linhas carregadas — e quem lê acredita. */
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {rows.length === 0 ? (
            <>
              Nenhuma implementação ainda. Clique em <strong>Nova</strong> para começar.
            </>
          ) : (
            <>
              <p>
                Nenhuma das <strong>{rows.length}</strong> sugestões carregadas bate
                com este filtro.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFEmpresa("todas");
                  setFStatus("todos");
                  setSoSemRice(false);
                }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Pedido (O quê)</th>
                <th className="px-3 py-2 font-semibold">Tipo</th>
                <th className="px-2 py-2 text-center font-semibold" title="Reach">R</th>
                <th className="px-2 py-2 text-center font-semibold" title="Impact">I</th>
                <th className="px-2 py-2 text-center font-semibold" title="Confidence">C</th>
                <th className="px-2 py-2 text-center font-semibold" title="Effort">E</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold" title="PR que esta sugestao originou">PR</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => {
                const draft = drafts[r.id];
                const loading = !!sugLoading[r.id];
                const erro = sugError[r.id];
                const isTriagem = r.status === "triagem";
                // Score em prévia enquanto há rascunho (live, reflete edições).
                const draftScore = draft
                  ? calcRiceScore(
                      numOrNull(draft.reach),
                      numOrNull(draft.impact),
                      numOrNull(draft.confidence),
                      numOrNull(draft.effort),
                    )
                  : null;

                const renderEixo = (eixo: Eixo, value: number | null) =>
                  draft ? (
                    <div className="flex flex-col items-center gap-0.5">
                      <DraftRiceInput
                        value={draft[eixo]}
                        ia={draft.ia[eixo]}
                        onChange={(v) => setDraftField(r.id, eixo, v)}
                      />
                      {draft.justificativas?.[eixo] && (
                        <JustificativaTip texto={draft.justificativas[eixo]!} />
                      )}
                    </div>
                  ) : (
                    <RiceInput
                      value={value}
                      onCommit={(v) => commitRice(r.id, { [eixo]: v })}
                    />
                  );

                return (
                  <tr key={r.id} className="border-t border-border align-top">
                    <td className="max-w-xs px-3 py-2">
                      <p className="font-medium text-foreground">{r.oQue}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        <span className="font-semibold">Por quê:</span> {r.porQue}
                      </p>
                      {r.anexos.length > 0 ? (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                            <Paperclip className="h-3 w-3" />
                            {r.anexos.length}{" "}
                            {r.anexos.length === 1 ? "anexo" : "anexos"}
                          </span>
                          <ul className="mt-1 flex flex-wrap gap-1">
                            {r.anexos.map((a) => (
                              <li
                                key={a.id}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px]"
                              >
                                <a
                                  href={`/api/configuracoes/implementacoes/anexos/${a.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={a.nomeArquivo}
                                  className="max-w-[110px] truncate font-medium text-foreground hover:text-primary hover:underline"
                                >
                                  {a.nomeArquivo}
                                </a>
                                <button
                                  type="button"
                                  onClick={() => removerAnexoRow(r.id, a.id)}
                                  aria-label={`Remover ${a.nomeArquivo}`}
                                  className="text-muted-foreground transition-colors hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        r.printUrl && (
                          <a
                            href={`/api/configuracoes/implementacoes/${r.id}/print`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                          >
                            <Paperclip className="h-3 w-3" />
                            Ver print
                          </a>
                        )
                      )}

                      {/* Fase C: botão IA / barra de rascunho (só em triagem) */}
                      {isTriagem && (
                        <div className="mt-2">
                          {!draft ? (
                            <>
                              <button
                                type="button"
                                onClick={() => sugerirRice(r.id)}
                                disabled={loading}
                                className="inline-flex items-center gap-1.5 rounded-full border border-[#FFB114]/40 bg-[#FFB114]/10 px-2.5 py-1 text-[11px] font-semibold text-[#9a6a00] transition-colors hover:bg-[#FFB114]/20 disabled:opacity-70 dark:text-[#FFB114]"
                              >
                                {loading ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Analisando…
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3" />
                                    Sugerir RICE com IA
                                  </>
                                )}
                              </button>
                              {loading && (
                                <p className="mt-1 text-[10px] text-muted-foreground">
                                  Lendo conteúdo e anexos (pode levar até ~1 min).
                                </p>
                              )}
                              {erro && (
                                <p className="mt-1 text-[11px] text-destructive">
                                  {erro}
                                </p>
                              )}
                            </>
                          ) : (
                            <div className="rounded-lg border border-[#FFB114]/40 bg-[#FFB114]/5 p-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#9a6a00] dark:text-[#FFB114]">
                                <Sparkles className="h-3 w-3" />
                                Sugestão da IA (rascunho — não salvo)
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <span className="text-[11px] text-muted-foreground">
                                  Score prévia:{" "}
                                  <span className="font-bold tabular-nums text-foreground">
                                    {draftScore ?? "—"}
                                  </span>
                                </span>
                                {draft.confiancaGeral && (
                                  <span
                                    className={cn(
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                      CONF_STYLE[draft.confiancaGeral] ??
                                        "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {CONF_LABEL[draft.confiancaGeral] ??
                                      draft.confiancaGeral}
                                  </span>
                                )}
                              </div>
                              {draft.anexosIgnorados &&
                                draft.anexosIgnorados.length > 0 && (
                                  <p className="mt-1 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                                    {draft.anexosIgnorados.length} anexo(s) não
                                    pôde(m) ser lido(s); a sugestão considerou o
                                    restante.
                                  </p>
                                )}
                              <div className="mt-2 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => confirmarDraft(r.id)}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                  <Check className="h-3 w-3" />
                                  Confirmar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => descartarDraft(r.id)}
                                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                                >
                                  <X className="h-3 w-3" />
                                  Descartar
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {TIPO_LABEL[r.tipo] ?? r.tipo}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {renderEixo("reach", r.reach)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {renderEixo("impact", r.impact)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {renderEixo("confidence", r.confidence)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {renderEixo("effort", r.effort)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-bold tabular-nums",
                        draft ? "text-[#9a6a00] dark:text-[#FFB114]" : "text-foreground",
                      )}
                    >
                      {draft ? (draftScore ?? "—") : r.score != null ? r.score : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={r.status}
                        onChange={(e) => commitStatus(r.id, e.target.value)}
                        className={cn(
                          "rounded-full px-2 py-1 text-xs font-semibold",
                          STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <PrCell
                        numero={r.prNumero}
                        url={r.prUrl}
                        status={r.prStatus}
                        onVincular={(n, u, st) => commitPr(r.id, n, u, st)}
                        onDesvincular={() => commitPr(r.id, null, null, "aberta")}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
