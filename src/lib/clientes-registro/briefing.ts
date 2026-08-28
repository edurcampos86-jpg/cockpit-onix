/**
 * Briefing de preparação de reunião — módulo PURO.
 *
 * Recebe o que a ficha do cliente já guarda em quatro lugares separados
 * (ligações, reuniões estruturadas, tarefas abertas e o PAT) e devolve UMA
 * leitura: momento de vida, pendências por responsável, pauta sugerida e como
 * conduzir.
 *
 * A agregação é a entrega. Hoje esses quatro moram em abas diferentes da mesma
 * tela, e preparar reunião significa abrir as quatro e reconciliar de cabeça —
 * que é exatamente o trabalho que some quando o cliente entra na sala.
 *
 * Sem I/O e sem React de propósito: a rota busca, esta função decide, e o
 * "como conduzir" — que é a parte opinativa — fica testável linha a linha.
 */

/** Uma ligação/interação já registrada. */
export type InteracaoBriefing = {
  tipo: string;
  assunto: string;
  resumo: string | null;
  data: string; // ISO
};

/** Uma reunião estruturada já registrada. */
export type ReuniaoBriefing = {
  id: string;
  data: string; // ISO
  tipoCadencia: string | null;
  /** `Json?` no banco — chega como unknown e pode vir malformado. */
  pautas: unknown;
  pendencias: unknown;
  proximosPassos: unknown;
};

/** Tarefa aberta do cliente. */
export type TarefaBriefing = {
  titulo: string;
  responsavel: string; // "assessor" | "cliente"
  prazo: string | null;
  responsavelNome: string | null;
};

/** O PAT vigente, na forma resumida que a ficha guarda. */
export type PatBriefing = {
  arquetipoCodigo: number | null;
  arquetipoNome: string | null;
  perspectiva: string | null;
  orientacao: string | null;
  ambienteNome: string | null;
} | null;

export type PendenciaBriefing = {
  texto: string;
  responsavel: "assessor" | "cliente";
  origem: string; // "reunião de 12/03" | "tarefa"
  prazo: string | null;
};

export type Briefing = {
  momentoDeVida: string[];
  pendencias: { assessor: PendenciaBriefing[]; cliente: PendenciaBriefing[] };
  pautaSugerida: string[];
  comoConduzir: string[];
  /** Contagens que a tela mostra sem ter que recontar arrays. */
  resumo: {
    diasDesdeUltimoContato: number | null;
    diasDesdeUltimaReuniao: number | null;
    totalPendenciasAbertas: number;
  };
};

/** Lê `pautas` (Json) defensivamente. Malformado degrada para vazio, nunca lança. */
function lerPautas(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((i) => {
      if (typeof i === "string") return i;
      if (i && typeof i === "object" && "texto" in i) {
        const t = (i as { texto?: unknown }).texto;
        return typeof t === "string" ? t : "";
      }
      return "";
    })
    .filter((s) => s.trim().length > 0);
}

/** Lê `pendencias` (Json) defensivamente: `{ assessor: [], cliente: [] }`. */
function lerPendencias(v: unknown): { assessor: string[]; cliente: string[] } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { assessor: [], cliente: [] };
  const o = v as { assessor?: unknown; cliente?: unknown };
  return { assessor: lerPautas(o.assessor), cliente: lerPautas(o.cliente) };
}

/** Lê `proximosPassos` (Json), devolvendo só os NÃO concluídos. */
function lerProximosPassosAbertos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((i) => {
      if (!i || typeof i !== "object") return typeof i === "string";
      return (i as { concluido?: unknown }).concluido !== true;
    })
    .map((i) => (typeof i === "string" ? i : String((i as { texto?: unknown }).texto ?? "")))
    .filter((s) => s.trim().length > 0);
}

/** Dias inteiros entre duas datas. Negativo vira 0 — data futura não é "há N dias". */
function diasEntre(de: Date, ate: Date): number {
  const ms = ate.getTime() - de.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function dataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "data desconhecida";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Como conduzir, derivado do PAT.
 *
 * O PAT já está na ficha e ninguém o lê antes de reunião — porque ele chega
 * como PDF e como cinco campos soltos, não como instrução. Aqui ele vira
 * frase acionável.
 *
 * As regras são DELIBERADAMENTE poucas e literais (uma por eixo do PAT). Um
 * modelo mais esperto aqui seria pior: o Eduardo precisa saber de onde veio
 * cada frase para discordar dela.
 */
export function comoConduzirPorPat(pat: PatBriefing): string[] {
  if (!pat) {
    return ["Sem PAT vigente na ficha — conduzir pelo histórico das reuniões anteriores."];
  }

  const linhas: string[] = [];

  if (pat.arquetipoNome) {
    const cod = pat.arquetipoCodigo ? `${pat.arquetipoCodigo} — ` : "";
    linhas.push(`Arquétipo ${cod}${pat.arquetipoNome}.`);
  }

  if (pat.orientacao === "Social") {
    linhas.push("Orientação social: abrir pela conversa, decidir junto. Número puro trava a reunião.");
  } else if (pat.orientacao === "Técnico") {
    linhas.push("Orientação técnica: levar o número na frente. Rodeio soa como enrolação.");
  }

  if (pat.perspectiva === "Alta") {
    linhas.push("Perspectiva alta: aguenta cenário de longo prazo — dá para falar de sucessão e legado.");
  } else if (pat.perspectiva === "Baixa") {
    linhas.push("Perspectiva baixa: fechar em passo curto e concreto, com data. Horizonte longo se perde.");
  }

  if (pat.ambienteNome) {
    linhas.push(`Ambiente ${pat.ambienteNome} — calibrar o tom da conversa por ele.`);
  }

  return linhas.length > 0 ? linhas : ["PAT vigente sem eixos preenchidos — conduzir pelo histórico."];
}

/**
 * Monta o briefing.
 *
 * `agora` é PARÂMETRO, não `new Date()` interno: briefing que depende do
 * relógio da máquina não é testável e muda de resposta entre o servidor e o
 * navegador.
 */
export function montarBriefing(entrada: {
  agora: Date;
  interacoes: readonly InteracaoBriefing[];
  reunioes: readonly ReuniaoBriefing[];
  tarefas: readonly TarefaBriefing[];
  pat: PatBriefing;
  eventosVida?: readonly { titulo: string; data: string; tipo: string }[];
  metas?: readonly { titulo: string; status: string }[];
}): Briefing {
  const { agora, interacoes, reunioes, tarefas, pat } = entrada;

  // ── Momento de vida: o que mudou desde a última conversa ──
  const momentoDeVida: string[] = [];

  for (const m of entrada.metas ?? []) {
    if (m.status === "ativa") momentoDeVida.push(`Meta em aberto: ${m.titulo}`);
  }
  for (const e of entrada.eventosVida ?? []) {
    momentoDeVida.push(`${e.titulo} (${dataCurta(e.data)})`);
  }
  // Assunto da última conversa entra sempre — é o gancho de abertura.
  const ultimaInteracao = interacoes[0];
  if (ultimaInteracao) {
    momentoDeVida.push(
      `Último contato (${dataCurta(ultimaInteracao.data)}): ${ultimaInteracao.assunto}`,
    );
  }

  // ── Pendências: das reuniões (Json) + das tarefas (tabela) ──
  const assessor: PendenciaBriefing[] = [];
  const cliente: PendenciaBriefing[] = [];

  for (const r of reunioes) {
    const p = lerPendencias(r.pendencias);
    const origem = `reunião de ${dataCurta(r.data)}`;
    for (const t of p.assessor) assessor.push({ texto: t, responsavel: "assessor", origem, prazo: null });
    for (const t of p.cliente) cliente.push({ texto: t, responsavel: "cliente", origem, prazo: null });
    // Próximo passo aberto é pendência do assessor até alguém dizer o contrário.
    for (const t of lerProximosPassosAbertos(r.proximosPassos)) {
      assessor.push({ texto: t, responsavel: "assessor", origem, prazo: null });
    }
  }

  for (const t of tarefas) {
    const item: PendenciaBriefing = {
      texto: t.responsavelNome ? `${t.titulo} (${t.responsavelNome})` : t.titulo,
      responsavel: t.responsavel === "cliente" ? "cliente" : "assessor",
      origem: "tarefa",
      prazo: t.prazo,
    };
    if (item.responsavel === "cliente") cliente.push(item);
    else assessor.push(item);
  }

  // ── Pauta sugerida: pendência do cliente primeiro ──
  // Ordem deliberada: o que ELE deve vem antes do que EU devo. Cobrar no fim
  // da reunião é o jeito mais confiável de não cobrar.
  const pautaSugerida: string[] = [];
  for (const p of cliente) pautaSugerida.push(`Cobrar: ${p.texto}`);
  for (const p of assessor) pautaSugerida.push(`Entregar: ${p.texto}`);
  // Pautas repetidas das reuniões anteriores, sem duplicar.
  const jaNaPauta = new Set(pautaSugerida.map((s) => s.toLowerCase()));
  for (const r of reunioes) {
    for (const t of lerPautas(r.pautas)) {
      const linha = `Retomar: ${t}`;
      if (!jaNaPauta.has(linha.toLowerCase())) {
        jaNaPauta.add(linha.toLowerCase());
        pautaSugerida.push(linha);
      }
    }
  }

  const ultimaReuniao = reunioes[0];

  return {
    momentoDeVida,
    pendencias: { assessor, cliente },
    pautaSugerida,
    comoConduzir: comoConduzirPorPat(pat),
    resumo: {
      diasDesdeUltimoContato: ultimaInteracao
        ? diasEntre(new Date(ultimaInteracao.data), agora)
        : null,
      diasDesdeUltimaReuniao: ultimaReuniao ? diasEntre(new Date(ultimaReuniao.data), agora) : null,
      totalPendenciasAbertas: assessor.length + cliente.length,
    },
  };
}
