"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Plus,
  Paperclip,
  X,
  Sparkles,
  Loader2,
  Check,
  Info,
  AlertTriangle,
  Search,
  ChevronDown,
  ChevronRight,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  calcRiceScore,
  calcRiceScoreV2,
  validarRice,
  RICE_CAMPOS,
  type RiceEixo,
} from "@/lib/rice";
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
  /* Opcionais porque só existem com IMPLEMENTACOES_V2 ligada — com a flag OFF a
   * página nem os inclui no payload. Ver page.tsx. */
  criadoEm?: string;
  autorNome?: string;
};

type Eixo = RiceEixo;

/** O conjunto completo de fatores que a gravação envia. */
type RiceVals = {
  reach: number | null;
  impact: number | null;
  confidence: number | null;
  effort: number | null;
};

/** Critério de ordenação da fila (v2). */
type Ordem = "score" | "data" | "empresa";

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

/**
 * Teto de itens por rodada do lote de sugestão da IA.
 *
 * Cada item é uma chamada de visão que baixa os anexos do B2 e leva até ~1 min.
 * Sem teto, um clique com a fila cheia vira dezenas de minutos de chamadas
 * pagas que ninguém consegue interromper no meio. 20 mantém o pior caso em
 * torno de 20 min e ainda resolve a fila de um dia ruim em poucas rodadas —
 * repetir o clique retoma de onde parou, porque o que já foi pontuado sai do
 * filtro sozinho.
 */
const MAX_LOTE = 20;

/**
 * Janela do autosave. 600 ms é o intervalo em que uma pessoa digitando "100" no
 * campo de confiança ainda não terminou de digitar: gravar por tecla mandaria
 * "1", depois "10", depois "100" — e "1" é um valor válido, então o banco
 * registraria três estados, dois deles nunca pretendidos.
 */
const DEBOUNCE_AUTOSAVE_MS = 600;

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

/* Rótulo de exibição do status. O `value` do <option> continua sendo o id
 * gravado — `commitStatus`/`atualizarStatus` recebem exatamente o mesmo valor.
 * O que muda é só o que a pessoa lê: "em-andamento" com hífen e "concluida"
 * sem acento são identificadores, não português. */
const STATUS_LABEL: Record<string, string> = {
  triagem: "Em análise",
  aprovada: "Aprovada",
  "em-andamento": "Em andamento",
  concluida: "Concluída",
  recusada: "Recusada",
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

/**
 * Minúsculas e sem acento, para a busca casar "relatorio" com "Relatório".
 * Quem digita rápido não acentua, e uma busca que exige acento é uma busca que
 * responde "nada encontrado" sobre uma fila que tem o item.
 */
function normalizarBusca(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Score como número de LEITURA, não como número de cálculo.
 *
 * O score guarda 4 casas de propósito: é isso que impede a régua nova de criar
 * empate onde a antiga distinguia (ver `lib/rice.ts`). Mas essa precisão existe
 * para ORDENAR, não para ser lida — e ela vazou para a tela: numa fila em que
 * quase todo score é redondo, um "266,6667" ao lado de um "300" parece defeito,
 * e obriga a pessoa a contar casas decimais para comparar duas linhas.
 *
 * Uma casa basta para distinguir prioridades nesta grandeza. E arredondar aqui
 * não mexe em ordenação nem em ranking: a posição continua sendo calculada sobre
 * o valor cheio — o que muda é só o que se lê.
 */
function formatarScore(score: number): string {
  return score.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * Data curta (dd/mm/aa) a partir do ISO que o servidor mandou.
 *
 * ISO string, e não `Date`, atravessando a fronteira servidor→cliente: assim a
 * data exibida não depende do fuso do processo que serializou. A formatação
 * acontece aqui, no navegador de quem lê.
 */
function formatarData(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/** "" → null; valor não-numérico → null; senão number. */
function numOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

/**
 * Input de RICE salvo.
 *
 * Sem `v2`: dispara onCommit (→ atualizarRice) no blur — comportamento original,
 * intocado.
 *
 * Com `v2`: dispara a cada tecla e o PAI segura por 600 ms antes de gravar
 * (autosave com debounce). O blur continua disparando, o que faz o pai gravar na
 * hora — sair do campo é uma declaração de que terminou, e esperar mais 600 ms
 * depois disso só cria janela para a pessoa fechar a aba antes de salvar.
 */
function RiceInput({
  value,
  onCommit,
  v2 = false,
  erro = false,
  descritoPor,
}: {
  value: number | null;
  onCommit: (v: number | null, imediato?: boolean) => void;
  v2?: boolean;
  erro?: boolean;
  /** id do parágrafo de erro da linha, para o leitor de tela ligar um ao outro. */
  descritoPor?: string;
}) {
  const [local, setLocal] = useState(value?.toString() ?? "");

  // Sem efeito espelhando a prop no estado local. Quando o valor muda POR FORA
  // — desfazer de uma gravação recusada, clique num preset — o pai troca a `key`
  // deste input e ele remonta já com o valor certo. Um efeito aqui rodaria a
  // cada tecla, para reafirmar um valor que quase sempre já é o que está na tela.
  const parse = (t: string) => {
    const n = t === "" ? null : Number(t);
    return n != null && Number.isNaN(n) ? null : n;
  };

  return (
    <input
      type="number"
      min={0}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        if (v2) onCommit(parse(e.target.value));
      }}
      onBlur={() => onCommit(parse(local), true)}
      aria-invalid={erro || undefined}
      aria-describedby={erro ? descritoPor : undefined}
      className={cn(
        "w-14 rounded-md border bg-background px-1.5 py-1 text-center text-xs tabular-nums focus:outline-none",
        erro
          ? "border-destructive text-destructive"
          : "border-border focus:border-primary",
      )}
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

/* ──────────────────────────────────────────────────────────────────────────
 * Peças da tela refinada (só montadas com IMPLEMENTACOES_V2 ligada).
 *
 * Sobre a cor: o dourado da marca aparece SÓ como elemento gráfico (a barra do
 * score, a borda do rascunho da IA). Texto corrido — inclusive a posição no
 * ranking, que é texto pequeno — fica em cinza escuro. Dourado sobre fundo claro
 * não alcança 4,5:1 em corpo de texto, e "está na identidade" não torna legível
 * o que não é.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Cabeçalho R/I/C/E que DIZ A UNIDADE. Sem isto, "R = 40" pode ser 40 clientes,
 * 40 atendimentos ou 40 por semana, e duas pessoas pontuando a mesma fila com
 * unidades diferentes produzem um ranking que não significa nada.
 *
 * Popover em botão nativo, não `title=`: atributo `title` não abre por teclado e
 * não é lido de forma confiável por leitor de tela — a unidade ficaria disponível
 * só para quem usa mouse.
 */
function CabecalhoEixo({ eixo }: { eixo: Eixo }) {
  const campo = RICE_CAMPOS[eixo];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${campo.nome} — ${campo.unidade}`}
        className="inline-flex items-center gap-1 rounded px-1 font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {campo.sigla}
        <Info className="h-3 w-3 opacity-60" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="center" className="max-w-[260px] text-xs leading-relaxed">
        <p className="font-semibold text-foreground">{campo.nome}</p>
        <p className="mt-1 text-muted-foreground">{campo.ajuda}</p>
        <p className="mt-1.5 rounded bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
          {campo.unidade}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Valores sugeridos, clicáveis, sob os campos de escala fechada (I e C).
 *
 * Existe porque a régua estava só no popover de ajuda: para acertar "80 = boa
 * evidência" era preciso abrir a ajuda, ler e voltar a digitar. Com o degrau a
 * um clique, a escala deixa de depender de memória — e é assim que duas pessoas
 * pontuam a mesma coisa parecido.
 */
function PresetsEixo({
  eixo,
  atual,
  onEscolher,
}: {
  eixo: Eixo;
  atual: number | null;
  onEscolher: (v: number) => void;
}) {
  const presets = RICE_CAMPOS[eixo].presets;
  if (presets.length === 0) return null;
  return (
    <div className="mt-1 flex justify-center gap-0.5">
      {presets.map((pr) => (
        <button
          key={pr.valor}
          type="button"
          onClick={() => onEscolher(pr.valor)}
          aria-pressed={atual === pr.valor}
          title={`${pr.valor} — ${pr.rotulo}`}
          className={cn(
            "rounded px-1 py-0.5 text-[10px] font-medium tabular-nums transition-colors",
            atual === pr.valor
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {pr.valor}
        </button>
      ))}
    </div>
  );
}

/**
 * Score com POSIÇÃO e barra proporcional.
 *
 * O número sozinho não responde a pergunta que se faz olhando a fila — "isto é
 * alto?". 32 é alto se o topo é 40 e irrelevante se o topo é 4.000. A barra dá a
 * resposta num relance e a posição dá a resposta exata.
 *
 * O valor numérico fica SEMPRE ao lado da barra: quem não distingue a cor, ou lê
 * por leitor de tela, não pode depender do gráfico para saber o número.
 */
function ScoreCell({
  score,
  posicao,
  total,
  fracao,
  rascunho,
}: {
  score: number | null;
  posicao: number | null;
  total: number;
  fracao: number;
  rascunho: boolean;
}) {
  if (score == null) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-baseline gap-1.5">
        {posicao != null && (
          <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
            #{posicao}/{total}
          </span>
        )}
        <span
          className={cn(
            "font-bold tabular-nums",
            rascunho ? "text-[#9a6a00] dark:text-[#FFB114]" : "text-foreground",
          )}
          // Valor cheio no title: quem precisar conferir a conta acha, sem que
          // a tabela inteira pague o preço de exibir 4 casas em toda linha.
          title={`Score exato: ${score}`}
        >
          {formatarScore(score)}
        </span>
      </div>
      <div
        className="h-1 w-16 overflow-hidden rounded-full bg-muted"
        role="presentation"
      >
        {/* Cores medidas contra o trilho (--muted) nos dois temas, porque o
          * mínimo para elemento gráfico é 3:1 e o dourado da marca não chega lá
          * no claro: #B8923D dá 2,38:1 sobre #EDE8DE. Os valores abaixo passam
          * nos dois — 4,00:1 e 8,12:1 na barra normal, 3,88:1 e 9,57:1 no
          * rascunho — e são os mesmos tons já usados no texto do score. */}
        <div
          className={cn(
            "h-full rounded-full",
            rascunho
              ? "bg-[#9a6a00] dark:bg-[#FFB114]"
              : "bg-[#8A6D2A] dark:bg-[#D2AC5B]",
          )}
          style={{ width: `${Math.max(2, Math.round(fracao * 100))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * O "Por quê" inteiro, sob demanda.
 *
 * A célula cortava em duas linhas com reticências. O "por quê" é o anel de dentro
 * do Golden Circle — é o que decide a prioridade — e era justamente o pedaço que
 * sumia. Abrir inline em vez de truncar: sem modal, sem sair da linha, sem perder
 * de vista o resto da fila.
 */
function PorQueExpansivel({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false);
  // Só oferece o toggle quando há o que revelar. Botão que não faz nada visível
  // é ruído — e nesta tabela ele apareceria em toda linha curta.
  const longo = texto.length > 110;

  if (!longo) {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold">Por quê:</span> {texto}
      </p>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      <p className={aberto ? undefined : "line-clamp-2"}>
        <span className="font-semibold">Por quê:</span> {texto}
      </p>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="mt-0.5 inline-flex items-center gap-0.5 rounded text-[11px] font-medium text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {aberto ? (
          <>
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
            Recolher
          </>
        ) : (
          <>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            Ler tudo
          </>
        )}
      </button>
    </div>
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
      label: "tempo típico da ideia até o ar",
    },
    {
      valor: String(m.comPr - m.entregues),
      // O rótulo diz exatamente o que a conta faz: `comPr − entregues`
      // (`metricas.ts:46,53`) é toda linha com entrega VINCULADA e sem data de
      // merge — o que inclui a descartada. "começadas" seria específico e
      // falso: uma entrega descartada não está a caminho do ar. E não é o mesmo
      // conjunto do status "Em andamento", que é digitado à mão.
      label: "entregas vinculadas, ainda não no ar",
    },
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
          + entrega
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
          placeholder="#123 ou link"
          className={cn(
            "w-28 rounded-md border bg-background px-1.5 py-1 text-xs focus:outline-none",
            erro ? "border-destructive" : "border-border focus:border-primary",
          )}
        />
        {erro && (
          <p className="mt-0.5 text-[10px] text-destructive">
            Cole o número da entrega (ex.: #123) ou o link dela.
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
          {/* `value` intacto: `PR_STATUSES` (actions/implementacao.ts) segue
              validando os mesmos três. Só o rótulo sai do jargão. */}
          <option value="aberta">em construção</option>
          <option value="merged">no ar</option>
          <option value="fechada">descartada</option>
        </select>
        <button
          type="button"
          onClick={onDesvincular}
          aria-label="Desvincular entrega"
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
  ocultadasSemRice = 0,
  metricas,
  v2 = false,
}: {
  itens: ImplementacaoDTO[];
  empresas: { id: string; nome: string }[];
  /** Linhas que existem no banco mas não vieram por causa do teto da página. */
  ocultadas?: number;
  /** Quantas das ocultas nunca foram pontuadas. Ver o banner abaixo. */
  ocultadasSemRice?: number;
  /** ROI de backlog — calculado sobre a fila INTEIRA, não sobre o recorte. */
  metricas: MetricasBacklog;
  /** IMPLEMENTACOES_V2. OFF (default) = a tela de antes desta entrega, sem desvio. */
  v2?: boolean;
}) {
  const [rows, setRows] = useState<ImplementacaoDTO[]>(itens);
  const [fEmpresa, setFEmpresa] = useState<string>("todas");
  const [fStatus, setFStatus] = useState<string>("todos");
  // Recorte "ainda sem RICE". Não é um status — é a ausência dos 4 fatores.
  const [soSemRice, setSoSemRice] = useState(false);
  // Recortes do refino (v2). Inertes com a flag OFF: nada os lê nem os renderiza.
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("score");
  /** Erro devolvido pelo servidor por linha, depois de desfazer a gravação. */
  const [erroSalvar, setErroSalvar] = useState<
    Record<string, { mensagem: string; eixos: RiceEixo[] } | null>
  >({});
  /**
   * Contador de remontagem por linha — entra na `key` dos inputs.
   *
   * Sobe em toda mudança de valor vinda de FORA do próprio input: o desfazer de
   * uma gravação recusada e o clique num preset. Sem isso o campo continua
   * exibindo o que a pessoa digitou enquanto a tela já mostra outro número — e o
   * blur seguinte regrava o valor velho por cima do novo.
   */
  const [remontas, setRemontas] = useState<Record<string, number>>({});
  // Lote de sugestão da IA: trava o botão e mostra progresso item a item.
  const [loteAtivo, setLoteAtivo] = useState(false);
  const [loteFeitos, setLoteFeitos] = useState(0);
  // Quantas o lote em curso vai chamar — pode ser MENOS que aPontuarNoRecorte
  // quando o teto por rodada corta. O progresso tem que contar sobre o que
  // realmente vai rodar, senão a barra para em "12/47" e parece travada.
  const [loteTotal, setLoteTotal] = useState(0);
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

  /** Timer do autosave por linha (v2). */
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  /**
   * Linhas com gravação JÁ despachada, esperando resposta.
   *
   * Separado de `timers` porque o timer é apagado no instante em que dispara,
   * antes do await. Sem esta marca, uma tecla digitada durante o voo veria
   * "nenhuma gravação pendente" e regravaria `antesDoAutosave` com um estado que
   * o servidor ainda pode recusar — e o desfazer restauraria justamente o valor
   * recusado.
   */
  const gravando = useRef<Record<string, true>>({});
  /** O que ainda não foi para o banco, por linha. Espelha `timers`. */
  const pendentes = useRef<Record<string, RiceVals>>({});
  /**
   * Estado da linha ANTES da primeira tecla da rajada atual — o alvo do desfazer.
   *
   * Guardado só quando não há gravação pendente para aquela linha. Se fosse
   * regravado a cada tecla, o "antes" viraria o penúltimo caractere digitado, e
   * desfazer uma recusa deixaria a linha num meio-termo que nunca existiu no banco.
   */
  const antesDoAutosave = useRef<Record<string, ImplementacaoDTO>>({});

  // Ao desmontar, GRAVA o que estiver pendente em vez de só cancelar o timer.
  // Sair da tela dentro da janela de 600 ms descartaria a última edição em
  // silêncio — o pior jeito de perder dado, porque a tela já mostrou o valor novo.
  //
  // Sem tocar estado aqui: o componente está saindo, e um desfazer que ninguém
  // vai ver só renderiza um aviso em árvore desmontada. Se o servidor recusar
  // neste ponto, o banco simplesmente não muda e a próxima carga mostra o valor
  // antigo — que é a verdade.
  useEffect(() => {
    const ts = timers.current;
    const ps = pendentes.current;
    return () => {
      for (const [id, t] of Object.entries(ts)) {
        clearTimeout(t);
        const vals = ps[id];
        if (vals) void atualizarRice(id, vals);
      }
    };
  }, []);

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
    let filtered = soSemRice
      ? noRecorte.filter((r) => r.score == null)
      : noRecorte;

    // Busca no pedido E no "por quê": a mesma ideia costuma ser lembrada pela
    // dor ("cliente reclamando de saldo") e não pelo título que alguém deu a ela.
    if (v2) {
      const termo = normalizarBusca(busca);
      if (termo) {
        filtered = filtered.filter(
          (r) =>
            normalizarBusca(r.oQue).includes(termo) ||
            normalizarBusca(r.porQue).includes(termo),
        );
      }
    }

    const porScore = (a: ImplementacaoDTO, b: ImplementacaoDTO) => {
      // score desc, nulls por último
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    };

    if (!v2 || ordem === "score") return [...filtered].sort(porScore);

    if (ordem === "data") {
      // Mais recente primeiro. Sem data (linha antiga vinda sem o campo) vai ao
      // fim, pelo mesmo motivo que score nulo vai: ausência não é "zero".
      return [...filtered].sort((a, b) => {
        if (!a.criadoEm && !b.criadoEm) return 0;
        if (!a.criadoEm) return 1;
        if (!b.criadoEm) return -1;
        return b.criadoEm.localeCompare(a.criadoEm);
      });
    }

    // Empresa: agrupa e, DENTRO de cada empresa, mantém o score desc — senão a
    // ordenação por empresa jogaria fora a priorização, que é o ponto da tela.
    return [...filtered].sort(
      (a, b) => a.empresaId.localeCompare(b.empresaId) || porScore(a, b),
    );
  }, [noRecorte, soSemRice, v2, busca, ordem]);

  /**
   * Posição no ranking, POR EMPRESA quando o filtro está em "Todas as empresas".
   *
   * Ranking global misturando empresas responderia a pergunta errada: uma ideia
   * da corretora não disputa fila com uma da gestora — quem executa é outro time,
   * e "#14 de 200" some com o fato de ela ser a primeira da própria casa.
   *
   * Calculado sobre `rows` — a fila carregada inteira —, NUNCA sobre o recorte
   * visível. Se dependesse do que está na tela, digitar na busca mudaria a
   * posição: um item que é o 17º da própria empresa passaria a exibir "#1/2" só
   * porque os outros 15 não casaram com o termo. A posição é a prioridade do
   * item na fila; ela não pode responder ao filtro de quem está olhando.
   *
   * Sempre agrupado por empresa: com o filtro numa empresa só, o grupo é ela
   * mesma, então a conta é a mesma dos dois jeitos.
   *
   * Calculado sempre sobre o score, mesmo quando a tabela está ordenada por data
   * ou empresa: a posição É a prioridade, não a linha em que o item calhou de cair.
   */
  const ranking = useMemo(() => {
    const mapa = new Map<string, { posicao: number; total: number; fracao: number }>();
    if (!v2) return mapa;

    const grupos = new Map<string, ImplementacaoDTO[]>();
    for (const r of rows) {
      if (r.score == null) continue; // sem RICE não entra no ranking
      const atual = grupos.get(r.empresaId);
      if (atual) atual.push(r);
      else grupos.set(r.empresaId, [r]);
    }

    for (const lista of grupos.values()) {
      const ord = [...lista].sort((a, b) => b.score! - a.score!);
      const topo = ord[0].score!;
      ord.forEach((r, i) => {
        mapa.set(r.id, {
          posicao: i + 1,
          total: ord.length,
          // Topo zero (só possível se todos forem zero) daria divisão por zero;
          // nesse caso a barra fica no mínimo para todos, que é honesto.
          fracao: topo > 0 ? r.score! / topo : 0,
        });
      });
    }
    return mapa;
  }, [rows, v2]);

  /**
   * Aplica o patch na tela na hora (otimista) e devolve os fatores resultantes.
   * Não grava — quem grava é quem chama, na hora que decidir.
   */
  function aplicarNaTela(id: string, patch: Partial<ImplementacaoDTO>): RiceVals {
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
    return {
      reach: row.reach,
      impact: row.impact,
      confidence: row.confidence,
      effort: row.effort,
    };
  }

  /**
   * Restaura a linha ao estado anterior à rajada e mostra o motivo da recusa.
   *
   * Incrementa `remontas[id]`, que entra na `key` dos inputs daquela linha: os
   * quatro campos remontam já com o valor restaurado. É o que evita ter de
   * espelhar prop em estado dentro do input — a tela mostraria o valor antigo e
   * o campo continuaria exibindo o recusado.
   */
  function desfazer(id: string, motivo: string) {
    // Cancela o que ainda está agendado. Sem isto, o desfazer restaura a linha,
    // avisa "voltou ao anterior" — e 600 ms depois o timer da tecla seguinte
    // dispara e grava mesmo assim. A tela diria uma coisa e o banco outra.
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    delete pendentes.current[id];

    const antes = antesDoAutosave.current[id];
    if (antes) {
      const next = rowsRef.current.map((r) => (r.id === id ? antes : r));
      rowsRef.current = next;
      setRows(next);
    }
    delete antesDoAutosave.current[id];
    setRemontas((m) => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
    // Recusa do servidor não diz qual eixo caiu — marca a linha, não um campo.
    setErroSalvar((m) => ({ ...m, [id]: { mensagem: motivo, eixos: [] } }));
  }

  /** Despacha a gravação pendente e trata a resposta. Usado pelo timer e pelo blur. */
  function gravarPendente(id: string) {
    const aGravar = pendentes.current[id];
    delete pendentes.current[id];
    if (!aGravar) return;
    gravando.current[id] = true;
    startTransition(async () => {
      // `try/finally`: o `delete` PRECISA rodar mesmo se a promise rejeitar
      // (queda de rede, Server Action fora do ar). Sem ele a marca fica presa,
      // e `commitRice` só recaptura `antesDoAutosave` quando a linha NÃO está
      // gravando — ou seja, o desfazer seguinte restauraria um estado de vários
      // minutos antes. É a rede de segurança do autosave apodrecendo calada.
      try {
        const res = await atualizarRice(id, aGravar);
        if (res?.ok) {
          // Só limpa o "antes" se nada novo entrou na fila enquanto isto voava —
          // senão o desfazer da próxima recusa perderia o alvo.
          if (!timers.current[id]) delete antesDoAutosave.current[id];
          return;
        }
        desfazer(id, res?.erro ?? "Não deu para salvar. O valor voltou ao anterior.");
      } catch {
        desfazer(id, "Sem conexão com o servidor. O valor voltou ao anterior.");
      } finally {
        delete gravando.current[id];
      }
    });
  }

  function commitRice(id: string, patch: Partial<ImplementacaoDTO>) {
    // ── Caminho antigo (flag OFF): grava direto, sem espera e sem desfazer. ──
    if (!v2) {
      const vals = aplicarNaTela(id, patch);
      startTransition(() => {
        void atualizarRice(id, vals);
      });
      return;
    }

    // ── Autosave (flag ON) ────────────────────────────────────────────────
    // Guarda o "antes" só quando NADA está em curso para esta linha — nem
    // agendado (`timers`) nem em voo (`gravando`). Com algo em curso, o estado
    // anterior verdadeiro é o último confirmado, não o caractere de agora.
    if (!timers.current[id] && !gravando.current[id]) {
      const atual = rowsRef.current.find((r) => r.id === id);
      if (atual) antesDoAutosave.current[id] = atual;
    }

    // Valida ANTES de aplicar. Aplicar primeiro e recusar depois deixava a coluna
    // Score exibindo um número que nunca foi gravado, até alguém recarregar.
    // Só o eixo editado: reprovar por causa de um valor herdado travaria a linha.
    const eixosTocados = Object.keys(patch) as RiceEixo[];
    const candidato = { ...pegarVals(id), ...patch } as RiceVals;
    const errosLocais = validarRice(candidato, eixosTocados);
    if (errosLocais.length > 0) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
      delete pendentes.current[id];
      setErroSalvar((m) => ({
        ...m,
        [id]: {
          mensagem: errosLocais.map((e) => e.mensagem).join(" "),
          eixos: errosLocais.map((e) => e.eixo),
        },
      }));
      return;
    }

    const vals = aplicarNaTela(id, patch);
    pendentes.current[id] = vals;
    setErroSalvar((m) => (m[id] ? { ...m, [id]: null } : m));

    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      gravarPendente(id);
    }, DEBOUNCE_AUTOSAVE_MS);
  }

  /** Sair do campo é declaração de que terminou: grava sem esperar os 600 ms. */
  function flushRice(id: string) {
    if (!v2 || !timers.current[id]) return;
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    gravarPendente(id);
  }

  /** Os quatro fatores da linha, como estão na tela agora. */
  function pegarVals(id: string): RiceVals {
    const r = rowsRef.current.find((x) => x.id === id);
    return {
      reach: r?.reach ?? null,
      impact: r?.impact ?? null,
      confidence: r?.confidence ?? null,
      effort: r?.effort ?? null,
    };
  }

  /**
   * Muda o status. Otimista na tela, mas com RECIBO.
   *
   * O `antes` é capturado desta linha, e não de `antesDoAutosave` — aquele é do
   * RICE e tem ciclo de vida próprio (o debounce do autosave). Misturar os dois
   * faria o desfazer do status restaurar valores de eixo.
   */
  function commitStatus(id: string, status: string) {
    const antes = rowsRef.current.find((r) => r.id === id);
    const next = rowsRef.current.map((r) =>
      r.id === id ? { ...r, status } : r,
    );
    rowsRef.current = next; // mantém o ref autoritativo entre commits do mesmo tick
    setRows(next);
    startTransition(async () => {
      try {
        const res = await atualizarStatus(id, status);
        if (res?.ok) return;
        reverterLinha(id, antes, res?.erro ?? "Não deu para mudar o status.");
      } catch {
        reverterLinha(id, antes, "Sem conexão com o servidor.");
      }
    });
  }

  /**
   * Devolve a linha ao estado anterior e diz por quê.
   *
   * Existe porque status e PR eram os dois únicos caminhos de gravação da tela
   * SEM desfazer: mudavam na tela, podiam não mudar no banco, e só a próxima
   * carga revelava. O RICE já tinha esta rede desde o autosave.
   */
  function reverterLinha(
    id: string,
    antes: ImplementacaoDTO | undefined,
    motivo: string,
  ) {
    if (antes) {
      const volta = rowsRef.current.map((r) => (r.id === id ? antes : r));
      rowsRef.current = volta;
      setRows(volta);
    }
    setErroSalvar((m) => ({ ...m, [id]: { mensagem: motivo, eixos: [] } }));
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
    const antes = rowsRef.current.find((r) => r.id === id);
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
      try {
        // `vincularPr` já devolvia `{ok, error}` — ninguém lia. As recusas são
        // reais: "Número de PR inválido", "Status de PR inválido",
        // "Não encontrado" e a falta de permissão.
        const res = await vincularPr(id, {
          numero,
          url: row.prUrl,
          status,
        });
        if (res?.ok) return;
        reverterLinha(id, antes, res?.error ?? "Não deu para vincular a entrega.");
      } catch {
        reverterLinha(id, antes, "Sem conexão com o servidor.");
      }
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
    const candidatos = visiveis.filter((r) => r.score == null && !drafts[r.id]);
    if (candidatos.length === 0) return;

    // Teto por rodada. Sem ele, um clique com a fila cheia dispara N chamadas
    // pagas de visão em sequência, cada uma baixando anexos do B2 — dezenas de
    // minutos de trabalho que ninguém consegue interromper depois de começar.
    // Com teto, o pior caso é limitado e previsível, e repetir o clique retoma
    // de onde parou (as já pontuadas saem do filtro sozinhas).
    const alvos = candidatos.slice(0, MAX_LOTE);
    const sobra = candidatos.length - alvos.length;

    // Confirmação com a CONTA na frente. O gesto é 1 clique e o custo não é
    // óbvio pelo botão; confirmar é o único ponto em que dá para desistir.
    const aviso = [
      `Estimar a prioridade de ${alvos.length} ${alvos.length === 1 ? "sugestão" : "sugestões"} com IA?`,
      "",
      "Cada uma é uma chamada à IA que lê o conteúdo e os anexos — leva até ~1 min por item, em sequência.",
      sobra > 0
        ? `\nAs outras ${sobra} ficam para a próxima rodada (teto de ${MAX_LOTE} por vez).`
        : "",
      "\nNada é salvo: tudo vira rascunho até você confirmar linha a linha.",
    ]
      .filter(Boolean)
      .join("\n");
    if (!confirm(aviso)) return;

    setLoteAtivo(true);
    setLoteTotal(alvos.length);
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
            Fila de melhorias · ordenada por prioridade
            <RiceHelp v2={v2} />
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
        {v2 && (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar no pedido e no porquê…"
                aria-label="Buscar no pedido e no porquê"
                className="w-60 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              aria-label="Ordenar por"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="score">Ordenar por score</option>
              <option value="data">Ordenar por data</option>
              <option value="empresa">Ordenar por empresa</option>
            </select>
          </>
        )}
        <select
          aria-label="Filtrar por empresa"
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
          aria-label="Filtrar por status"
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="todos">Todos os status</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st] ?? st}
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
            {semRice} ainda sem prioridade
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
                Sugerindo {loteFeitos}/{loteTotal}…
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                Estimar prioridade de{" "}
                {aPontuarNoRecorte > MAX_LOTE
                  ? `${MAX_LOTE} de ${aPontuarNoRecorte}`
                  : `as ${aPontuarNoRecorte}`}
              </>
            )}
          </button>
        )}
      </div>

      {ocultadas > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {/* O texto dizia "mais antigas", e estava errado: o recorte é
                `score desc nulls last`, então quem cai fora é quem tem MENOS
                score — e, antes de todos, quem não tem score nenhum. A ideia
                recém-enviada pelo FAB é a primeira a sumir, e o atalho "ainda
                sem prioridade" não a alcança porque filtra só o carregado. */}
            <strong>{ocultadas}</strong>{" "}
            {ocultadas === 1 ? "sugestão está fora" : "sugestões estão fora"} desta
            tela — a página traz as {rows.length} de maior prioridade.
            {ocultadasSemRice > 0 && (
              <>
                {" "}
                <strong>{ocultadasSemRice}</strong>{" "}
                {ocultadasSemRice === 1 ? "delas ainda não foi pontuada" : "delas ainda não foram pontuadas"}.
              </>
            )}{" "}
            Os filtros abaixo só enxergam o que está carregado.
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
              Nenhuma sugestão na fila. Clique em <strong>Nova</strong> e conte o que
              precisa melhorar.
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
                  setBusca("");
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
                {v2 ? (
                  <>
                    <th className="px-2 py-2 text-center font-semibold">
                      <CabecalhoEixo eixo="reach" />
                    </th>
                    <th className="px-2 py-2 text-center font-semibold">
                      <CabecalhoEixo eixo="impact" />
                    </th>
                    <th className="px-2 py-2 text-center font-semibold">
                      <CabecalhoEixo eixo="confidence" />
                    </th>
                    <th className="px-2 py-2 text-center font-semibold">
                      <CabecalhoEixo eixo="effort" />
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-2 py-2 text-center font-semibold" title="Reach">R</th>
                    <th className="px-2 py-2 text-center font-semibold" title="Impact">I</th>
                    <th className="px-2 py-2 text-center font-semibold" title="Confidence">C</th>
                    <th className="px-2 py-2 text-center font-semibold" title="Effort">E</th>
                  </>
                )}
                <th className="px-3 py-2 text-right font-semibold">Score</th>
                {v2 && (
                  <>
                    <th className="px-3 py-2 font-semibold">Quem pediu</th>
                    <th className="px-3 py-2 font-semibold">Quando</th>
                  </>
                )}
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold" title="A entrega que nasceu desta sugestão">Entrega</th>
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
                  ) : v2 ? (
                    <div>
                      <RiceInput
                        key={`${eixo}-${remontas[r.id] ?? 0}`}
                        value={value}
                        v2
                        erro={erroSalvar[r.id]?.eixos.includes(eixo) ?? false}
                        descritoPor={erroSalvar[r.id] ? `erro-${r.id}` : undefined}
                        onCommit={(v, imediato) => {
                          commitRice(r.id, { [eixo]: v });
                          if (imediato) flushRice(r.id);
                        }}
                      />
                      <PresetsEixo
                        eixo={eixo}
                        atual={value}
                        onEscolher={(v) => {
                          commitRice(r.id, { [eixo]: v });
                          flushRice(r.id);
                          // Remonta o campo: o valor veio de FORA dele, e o
                          // estado local do input não sabe disso. Sem isto a
                          // caixa segue exibindo o número antigo e o próximo
                          // blur o regrava por cima do que o preset salvou.
                          setRemontas((m) => ({ ...m, [r.id]: (m[r.id] ?? 0) + 1 }));
                        }}
                      />
                    </div>
                  ) : (
                    <RiceInput
                      value={value}
                      onCommit={(v) => commitRice(r.id, { [eixo]: v })}
                    />
                  );

                return (
                  <tr
                    key={r.id}
                    // Âncora do link "Ver na triagem" da confirmação do FAB.
                    // Sugestão nova nasce sem score, e a fila ordena score desc
                    // com nulos por último — ou seja, ela nasce no rodapé de uma
                    // lista de até 300 linhas. Sem âncora, "ver na triagem" abre
                    // a tela num lugar onde o item não está.
                    id={v2 ? `impl-${r.id}` : undefined}
                    className="border-t border-border align-top scroll-mt-24"
                  >
                    <td className="max-w-xs px-3 py-2">
                      <p className="font-medium text-foreground">{r.oQue}</p>
                      {v2 ? (
                        <PorQueExpansivel texto={r.porQue} />
                      ) : (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          <span className="font-semibold">Por quê:</span> {r.porQue}
                        </p>
                      )}
                      {/* A região viva fica SEMPRE montada, vazia quando não há
                        * erro. Criar o `role="status"` no mesmo instante em que
                        * o texto entra costuma não ser anunciado por leitor de
                        * tela — e o aviso de que a gravação foi desfeita é
                        * justamente o que não pode passar despercebido. */}
                      {v2 && (
                        <p
                          id={`erro-${r.id}`}
                          role="status"
                          aria-live="polite"
                          className={cn(
                            "mt-1 flex items-start gap-1 text-[11px] font-medium text-destructive",
                            !erroSalvar[r.id] && "sr-only",
                          )}
                        >
                          {erroSalvar[r.id] && (
                            <Undo2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          )}
                          {erroSalvar[r.id]?.mensagem ?? ""}
                        </p>
                      )}
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
                                    Estimar prioridade com IA
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
                    {v2 ? (
                      <td className="px-3 py-2 text-right">
                        <ScoreCell
                          score={
                            draft
                              ? calcRiceScoreV2(
                                  numOrNull(draft.reach),
                                  numOrNull(draft.impact),
                                  numOrNull(draft.confidence),
                                  numOrNull(draft.effort),
                                )
                              : calcRiceScoreV2(r.reach, r.impact, r.confidence, r.effort)
                          }
                          posicao={draft ? null : (ranking.get(r.id)?.posicao ?? null)}
                          total={ranking.get(r.id)?.total ?? 0}
                          fracao={ranking.get(r.id)?.fracao ?? 0}
                          rascunho={!!draft}
                        />
                      </td>
                    ) : (
                      <td
                        className={cn(
                          "px-3 py-2 text-right font-bold tabular-nums",
                          draft ? "text-[#9a6a00] dark:text-[#FFB114]" : "text-foreground",
                        )}
                      >
                        {draft ? (draftScore ?? "—") : r.score != null ? r.score : "—"}
                      </td>
                    )}
                    {v2 && (
                      <>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {r.autorNome ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                          {formatarData(r.criadoEm)}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Status de ${r.oQue}`}
                        value={r.status}
                        onChange={(e) => commitStatus(r.id, e.target.value)}
                        className={cn(
                          "rounded-full px-2 py-1 text-xs font-semibold",
                          STATUS_STYLE[r.status] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {STATUS_LABEL[st] ?? st}
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
