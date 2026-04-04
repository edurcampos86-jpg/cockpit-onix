/**
 * Plaud.ai API client (unofficial bearer token approach)
 *
 * Auth: token extraído de localStorage.getItem('tokenstr') em web.plaud.ai
 * Env vars:
 *   PLAUD_TOKEN       - bearer token do browser
 *   PLAUD_API_DOMAIN  - domínio da API (padrão: api.plaud.ai; EU: api-euc1.plaud.ai)
 */

const PLAUD_BASE = process.env.PLAUD_API_DOMAIN ?? "https://api.plaud.ai";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PlaudFile {
  id: string;
  filename: string;
  duration: number;        // ms
  start_time: number;      // epoch ms
  end_time: number;        // epoch ms
  is_trans: boolean;       // transcrição disponível
  is_summary: boolean;
  is_trash: boolean;
}

export interface PlaudSegment {
  speaker: string;
  content: string;
  start_time: number;      // ms
  end_time: number;        // ms
}

export interface PlaudTranscricao {
  fileId: string;
  filename: string;
  dataHora: Date;
  duracaoMin: number;
  textoCompleto: string;
  segmentos: PlaudSegment[];
  resumoIA: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function plaudHeaders(token: string) {
  return {
    Authorization: `bearer ${token}`,   // Plaud usa lowercase "bearer"
    "Content-Type": "application/json",
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Listar arquivos ──────────────────────────────────────────────────────────

export async function listarArquivos(token: string): Promise<PlaudFile[]> {
  const url = `${PLAUD_BASE}/file/simple/web`;
  const res = await fetch(url, { headers: plaudHeaders(token) });

  if (!res.ok) {
    throw new Error(`Plaud /file/simple/web retornou HTTP ${res.status}`);
  }

  const json = await res.json();
  const lista: any[] = json.data_file_list ?? json.data?.data_file_list ?? [];
  return lista.filter((f: any) => !f.is_trash);
}

// ─── Filtrar por período ──────────────────────────────────────────────────────

export function filtrarArquivosPorPeriodo(
  arquivos: PlaudFile[],
  inicio: Date,
  fim: Date
): PlaudFile[] {
  const inicioMs = inicio.getTime();
  const fimMs = fim.getTime() + 24 * 60 * 60 * 1000; // incluir o dia final completo

  return arquivos.filter((f) => {
    const t = f.start_time;
    return t >= inicioMs && t <= fimMs && f.is_trans;
  });
}

// ─── Associar arquivo a vendedor ──────────────────────────────────────────────

const VENDEDOR_KEYWORDS: Record<string, string[]> = {
  "Eduardo Campos": ["eduardo"],
  "Rose Oliveira":  ["rose"],
  "Thiago Vergal":  ["thiago"],
};

/**
 * Retorna o vendedor mencionado no nome do arquivo, ou null se não identificado.
 * Arquivos sem vendedor identificado são incluídos para TODOS os vendedores.
 */
export function identificarVendedor(filename: string): string | null {
  const lower = filename.toLowerCase();
  for (const [vendedor, keywords] of Object.entries(VENDEDOR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return vendedor;
    }
  }
  return null; // arquivo geral — será incluído para todos
}

// ─── Buscar transcrição completa de um arquivo ────────────────────────────────

export async function buscarTranscricao(
  fileId: string,
  filename: string,
  startTimeMs: number,
  durationMs: number,
  token: string
): Promise<PlaudTranscricao | null> {
  const url = `${PLAUD_BASE}/file/detail/${fileId}`;
  const res = await fetch(url, { headers: plaudHeaders(token) });

  if (!res.ok) {
    console.warn(`[Plaud] Falha ao buscar detalhe de ${fileId}: HTTP ${res.status}`);
    return null;
  }

  const json = await res.json();
  const data = json.data ?? json;

  const transResult = data.trans_result ?? data.transResult ?? null;
  const aiContent   = data.ai_content   ?? data.aiContent   ?? null;

  if (!transResult) {
    console.warn(`[Plaud] Arquivo ${fileId} sem trans_result`);
    return null;
  }

  const segmentos: PlaudSegment[] = (transResult.segments ?? []).map((s: any) => ({
    speaker:    s.speaker ?? "Desconhecido",
    content:    s.content ?? s.text ?? "",
    start_time: s.start_time ?? s.start ?? 0,
    end_time:   s.end_time   ?? s.end   ?? 0,
  }));

  const textoCompleto =
    transResult.full_text ??
    segmentos.map((s) => s.content).join(" ") ??
    "";

  return {
    fileId,
    filename,
    dataHora:     new Date(startTimeMs),
    duracaoMin:   Math.round(durationMs / 60000),
    textoCompleto,
    segmentos,
    resumoIA:     aiContent?.summary ?? aiContent?.abstract ?? null,
  };
}

// ─── Formatar transcrição para análise ───────────────────────────────────────

export function formatarTranscricaoParaAnalise(t: PlaudTranscricao): string {
  const data = t.dataHora.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const cabecalho = `[PLAUD — ${t.filename} | ${data} | ${t.duracaoMin} min]`;

  if (t.segmentos.length > 0) {
    const linhas = t.segmentos.map(
      (s) => `${s.speaker}: ${s.content}`
    );
    return `${cabecalho}\n${linhas.join("\n")}`;
  }

  return `${cabecalho}\n${t.textoCompleto}`;
}

// ─── Buscar todas as transcrições do período para um vendedor ─────────────────

export async function buscarTranscricoesDoPeriodo(params: {
  vendedor: string;
  inicio: Date;
  fim: Date;
  token: string;
}): Promise<{ transcricoes: PlaudTranscricao[]; totalArquivos: number }> {
  const { vendedor, inicio, fim, token } = params;

  // 1. Lista todos os arquivos
  const todos = await listarArquivos(token);

  // 2. Filtra por período (apenas com transcrição disponível)
  const doPeriodo = filtrarArquivosPorPeriodo(todos, inicio, fim);

  // 3. Filtra por vendedor ou pega genéricos (sem vendedor identificado)
  const relevantes = doPeriodo.filter((f) => {
    const v = identificarVendedor(f.filename);
    return v === null || v === vendedor; // genérico ou específico desse vendedor
  });

  if (relevantes.length === 0) {
    return { transcricoes: [], totalArquivos: 0 };
  }

  // 4. Busca transcrição de cada arquivo (com delay para não sobrecarregar)
  const transcricoes: PlaudTranscricao[] = [];
  for (const arquivo of relevantes) {
    await sleep(300);
    const t = await buscarTranscricao(
      arquivo.id,
      arquivo.filename,
      arquivo.start_time,
      arquivo.duration,
      token
    );
    if (t) transcricoes.push(t);
  }

  return { transcricoes, totalArquivos: relevantes.length };
}
