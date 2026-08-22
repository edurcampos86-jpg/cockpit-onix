/**
 * Guia de Voz do Eduardo Campos — extrator SOMENTE LEITURA.
 *
 * Lê as transcrições do Cockpit, isola as falas do Eduardo, anonimiza, conta o
 * que dá pra contar, e usa a IA só pra NOMEAR os padrões e escrever as regras de
 * redação. Grava `docs/guia-voz-eduardo-v1.md`.
 *
 * NUNCA ESCREVE NO BANCO. Só `findMany`. Há um teste que falha se um método de
 * escrita aparecer neste arquivo (src/lib/voz/somente-leitura.test.ts).
 *
 * Uso:
 *   tsx scripts/guia-voz-eduardo.ts --dry-run     # só métricas, sem chamar a IA
 *   tsx scripts/guia-voz-eduardo.ts               # gera o guia
 *   tsx scripts/guia-voz-eduardo.ts --espelho     # espelho de reunião, 30 dias
 *
 * Precisa de: DATABASE_URL (leitura) e ANTHROPIC_API_KEY (salvo em --dry-run).
 */
import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  segmentarTurnos,
  atribuirEduardo,
  type Turno,
} from "../src/lib/voz/turnos";
import { anonimizar, auditarVazamento } from "../src/lib/voz/anonimizar";
import { reuniaoEhDaPessoa } from "../src/lib/reunioes/escopo-reuniao";
import {
  calcularRitmo,
  extrairAnalogias,
  ranquearAnalogias,
  extrairAberturas,
  lexicoCaracteristico,
  usoDeJargao,
  frasesAssinatura,
  trechosPorProduto,
  contarPadroesGenericos,
  type FalasPorReuniao,
} from "../src/lib/voz/metricas";

const MODELO = process.env.CLAUDE_MODEL_VOZ ?? "claude-opus-5";
const VENDEDOR = "Eduardo Campos";
/** Como o `Meeting.vendedor` pode se referir a ele. Mesma ideia dos
 *  `nomesDaPessoa` de `escopo-reuniao-sessao.ts`: o cadastro traz o nome
 *  completo, o campo traz o canônico, e igualdade exata falharia entre os dois. */
const NOMES_EDUARDO = ["Eduardo Campos", "Eduardo Rodrigues Campos"];
const LIMITE_LOTE = 80; // acima disso, processa por trimestre
const MAX_CHARS_POR_LOTE = 120_000;

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const ESPELHO = args.has("--espelho");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ── Coleta ──────────────────────────────────────────────────────────────────

interface ReuniaoCrua {
  id: string;
  fonte: "Meeting" | "ReuniaoEstruturada";
  data: Date;
  texto: string;
  vendedorEhEduardo: boolean;
  participantes: string[];
}

/** Sem `vendedor` preenchido, só entra se a transcrição mostrar que é ele. */
const ASSINA_EDUARDO = /(^|\n)\s*(eduardo[\w .'-]*)\s*:/i;

/**
 * Contagem do acervo, antes de qualquer filtro de conteúdo.
 *
 * Serve para responder, sem abrir o guia: quanto existe, quanto é dele, como se
 * distribui no tempo, e quanto está órfão. O último número não é curiosidade —
 * `Meeting.vendedor` é a ÚNICA titularidade que o registro carrega (ver
 * `src/lib/reunioes/escopo-reuniao.ts`), então reunião sem vendedor é reunião
 * que ninguém com escopo restrito consegue ler. Órfã aqui = invisível lá.
 */
export interface Censo {
  transcricoes: { meeting: number; reuniaoEstruturada: number; total: number };
  doEduardo: { porTitular: number; porAssinaturaNaTranscricao: number; total: number };
  porTrimestre: Array<{ trimestre: string; reunioes: number }>;
  semTitular: { total: number; comAssinaturaDele: number };
}

let censo: Censo | null = null;
export const censoColetado = () => censo;

async function coletar(desde?: Date): Promise<ReuniaoCrua[]> {
  const meetings = await prisma.meeting.findMany({
    where: {
      transcription: { not: null },
      ...(desde ? { date: { gte: desde } } : {}),
    },
    select: {
      id: true, date: true, transcription: true, summary: true,
      insights: true, vendedor: true, participants: true,
    },
    orderBy: { date: "asc" },
  });

  // A régua de titularidade é a MESMA que a rota /api/meetings usa desde o #363
  // — `reuniaoEhDaPessoa`, contenção de tokens. Reimplementar com `===` aqui
  // criaria uma segunda definição de "reunião do Eduardo", e a que divergir
  // primeiro é sempre a que ninguém olha.
  const comTitular = meetings.filter((m) => reuniaoEhDaPessoa(m.vendedor, NOMES_EDUARDO));

  // Sem vendedor declarado o #363 não libera para quem tem escopo restrito, e
  // com razão. Aqui o extrator roda como o próprio Eduardo sobre a voz dele, e
  // exige evidência no texto: o nome dele como rótulo de falante. Entram, mas
  // contadas à parte — dentro da reunião, `atribuirEduardo` ainda só aceita
  // turno rotulado com o nome dele.
  const orfas = meetings.filter((m) => !m.vendedor?.trim());
  const orfasAssinadas = orfas.filter((m) => ASSINA_EDUARDO.test(m.transcription ?? ""));
  const doEduardo = [...comTitular, ...orfasAssinadas];

  const estruturadas = await prisma.reuniaoEstruturada.findMany({
    where: {
      textoBruto: { not: null },
      ...(desde ? { data: { gte: desde } } : {}),
    },
    select: {
      id: true, data: true, textoBruto: true,
      pessoa: { select: { nomeCompleto: true, apelido: true } },
    },
    orderBy: { data: "asc" },
  });

  const out: ReuniaoCrua[] = doEduardo.map((m) => ({
    id: m.id,
    fonte: "Meeting" as const,
    data: m.date,
    texto: m.transcription!,
    vendedorEhEduardo: true,
    participantes: (m.participants ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  }));

  for (const r of estruturadas) {
    const dono = `${r.pessoa?.nomeCompleto ?? ""} ${r.pessoa?.apelido ?? ""}`.trim();
    // textoBruto é resumo do Plaud, não diarizado. Só entra se for dele.
    if (dono && !/eduardo/i.test(dono)) continue;
    if (!dono && !ASSINA_EDUARDO.test(r.textoBruto ?? "")) continue;
    out.push({
      id: r.id,
      fonte: "ReuniaoEstruturada",
      data: r.data,
      texto: r.textoBruto!,
      vendedorEhEduardo: true,
      participantes: [],
    });
  }

  const ordenadas = out.sort((a, b) => a.data.getTime() - b.data.getTime());

  const trimestres = new Map<string, number>();
  for (const r of ordenadas) {
    const k = trimestre(r.data);
    trimestres.set(k, (trimestres.get(k) ?? 0) + 1);
  }

  censo = {
    transcricoes: {
      meeting: meetings.length,
      reuniaoEstruturada: estruturadas.length,
      total: meetings.length + estruturadas.length,
    },
    doEduardo: {
      porTitular: comTitular.length,
      porAssinaturaNaTranscricao: ordenadas.length - comTitular.length,
      total: ordenadas.length,
    },
    porTrimestre: [...trimestres.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([trimestre, reunioes]) => ({ trimestre, reunioes })),
    semTitular: { total: orfas.length, comAssinaturaDele: orfasAssinadas.length },
  };

  return ordenadas;
}

/** Denylist a partir do banco: é a defesa forte da anonimização. */
async function montarDenylist(): Promise<string[]> {
  const [clientes, leads] = await Promise.all([
    prisma.clienteBackoffice.findMany({ select: { nome: true } }),
    prisma.lead.findMany({ select: { name: true } }),
  ]);
  const nomes = new Set<string>();
  for (const c of clientes) if (c.nome?.trim()) nomes.add(c.nome.trim());
  for (const l of leads) if (l.name?.trim()) nomes.add(l.name.trim());
  return [...nomes];
}

// ── Corpus anonimizado ──────────────────────────────────────────────────────

interface Corpus {
  porReuniao: FalasPorReuniao[];
  eduardo: string[];
  interlocutores: string[];
  cobertura: {
    reunioes: number;
    reunioesComFalaDele: number;
    turnosPorConfianca: Record<string, number>;
    turnosDescartados: number;
    redacoes: Record<string, number>;
  };
}

function montarCorpus(reunioes: ReuniaoCrua[], denylist: string[]): Corpus {
  const porReuniao: FalasPorReuniao[] = [];
  const eduardo: string[] = [];
  const interlocutores: string[] = [];
  const turnosPorConfianca: Record<string, number> = {};
  const redacoes: Record<string, number> = {};
  let descartados = 0;

  const opcoes = { denylist, allowlist: [VENDEDOR, "Eduardo", "Campos", "Onix"] };

  for (const r of reunioes) {
    const seg = atribuirEduardo(segmentarTurnos(r.texto), {
      vendedorEhEduardo: r.vendedorEhEduardo,
      participantes: r.participantes,
    });

    const dele: string[] = [];
    for (const t of seg.turnos as Turno[]) {
      const { texto, contagem } = anonimizar(t.texto, opcoes);
      for (const [k, v] of Object.entries(contagem)) redacoes[k] = (redacoes[k] ?? 0) + v;
      if (t.ehEduardo) {
        turnosPorConfianca[t.confianca] = (turnosPorConfianca[t.confianca] ?? 0) + 1;
        dele.push(texto);
      } else if (t.rotulo) {
        interlocutores.push(texto);
      } else {
        descartados++;
      }
    }
    if (dele.length) {
      porReuniao.push({ reuniaoId: r.id, falas: dele });
      eduardo.push(...dele);
    }
  }

  return {
    porReuniao,
    eduardo,
    interlocutores,
    cobertura: {
      reunioes: reunioes.length,
      reunioesComFalaDele: porReuniao.length,
      turnosPorConfianca,
      turnosDescartados: descartados,
      redacoes,
    },
  };
}

// ── Métricas ────────────────────────────────────────────────────────────────

function calcularTudo(corpus: Corpus) {
  const comparado = { eduardo: corpus.eduardo, interlocutores: corpus.interlocutores };
  return {
    cobertura: corpus.cobertura,
    analogias: ranquearAnalogias(extrairAnalogias(corpus.eduardo)).slice(0, 25),
    aberturas: extrairAberturas(corpus.eduardo),
    lexico: lexicoCaracteristico(comparado).slice(0, 60),
    jargao: usoDeJargao(comparado),
    ritmo: calcularRitmo(corpus.eduardo),
    produtos: trechosPorProduto(corpus.eduardo),
    assinaturas: frasesAssinatura(corpus.porReuniao),
    ausentes: contarPadroesGenericos(corpus.eduardo),
  };
}

type Metricas = ReturnType<typeof calcularTudo>;

// ── Lotes por trimestre ─────────────────────────────────────────────────────

function trimestre(d: Date): string {
  return `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function lotear(reunioes: ReuniaoCrua[]): ReuniaoCrua[][] {
  if (reunioes.length <= LIMITE_LOTE) return [reunioes];
  const mapa = new Map<string, ReuniaoCrua[]>();
  for (const r of reunioes) {
    const k = trimestre(r.data);
    if (!mapa.has(k)) mapa.set(k, []);
    mapa.get(k)!.push(r);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

// ── IA ──────────────────────────────────────────────────────────────────────

const SISTEMA = `Você escreve o Guia de Voz do Eduardo Campos, assessor de investimentos da Onix Capital.

O guia descreve COMO O EDUARDO FALA. Nunca O QUE OS CLIENTES CONTARAM.

O material que você recebe JÁ FOI ANONIMIZADO: nomes viraram [cliente], valores viraram [valor], situações de saúde viraram [situação de saúde], marcas viraram [instituição]. Você NUNCA reconstrói, adivinha ou preenche um placeholder. Se uma citação só faz sentido com o dado redigido, descarte a citação e use outra.

Você recebe também MÉTRICAS JÁ CONTADAS. Use os números que vieram; nunca invente frequência, nunca escreva "muitas vezes" quando o número está na sua frente.

Cada seção precisa de: exemplos literais (anonimizados) do material recebido, e uma regra prática de redação derivada, no formato "ao escrever X, prefira Y porque o Eduardo faz Y".

Escreva em português do Brasil, direto, sem enfeite. Markdown.`;

function blocoMetricas(m: Metricas): string {
  const j = (x: unknown) => JSON.stringify(x, null, 1);
  return `## MÉTRICAS CONTADAS (use estes números, não estime)

Cobertura: ${j(m.cobertura)}

Analogias ranqueadas por tema (ocorrências + exemplos literais):
${j(m.analogias)}

Aberturas de turno mais frequentes (≥3 ocorrências):
${j(m.aberturas.slice(0, 30))}

Léxico característico (log-odds contra as falas dos interlocutores no MESMO corpus; score alto = palavra dele, não do assunto):
${j(m.lexico)}

Uso de jargão financeiro — ordenado do que ele MENOS usa (eduardo=0 e interlocutores>0 significa que ele evita ou traduz):
${j(m.jargao)}

Ritmo:
${j(m.ritmo)}

Frases-assinatura (n-gramas em 3+ reuniões distintas):
${j(m.assinaturas.slice(0, 40))}

Padrões genéricos de redator — contagem no corpus dele (ocorrências≈0 vira a seção "o que ele nunca faz"):
${j(m.ausentes)}
`;
}

function amostra(falas: string[], maxChars: number): string {
  // Amostra espaçada ao longo do corpus, não os primeiros N — o começo do
  // arquivo é sempre a abertura da reunião, e daria um guia enviesado.
  const out: string[] = [];
  let total = 0;
  const passo = Math.max(1, Math.floor(falas.length / 400));
  for (let i = 0; i < falas.length; i += passo) {
    const f = falas[i]!;
    if (f.length < 40) continue;
    if (total + f.length > maxChars) break;
    out.push(f);
    total += f.length;
  }
  return out.join("\n---\n");
}

async function chamarIA(prompt: string, maxTokens = 12_000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente. Use --dry-run para rodar só as métricas.");
  const client = new Anthropic({ apiKey, timeout: 600_000, maxRetries: 2 });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: maxTokens,
    system: SISTEMA,
    messages: [{ role: "user", content: prompt }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

const SECOES = `1. **Analogias e metáforas recorrentes** — as que ele realmente usa, com a formulação literal dele, ranqueadas por frequência.
2. **Aberturas de explicação** — como ele começa a explicar um conceito.
3. **Léxico próprio** — palavras e expressões características; e a lista inversa: termos técnicos que ele evita ou sempre traduz.
4. **Ritmo** — comprimento típico de frase, pergunta retórica, repetição de estrutura, pausas marcadas.
5. **Como fala dos produtos sensíveis** — seguro de vida, consórcio, previdência: a sequência argumentativa DELE, não a do manual.
6. **Frases-assinatura** — formulações que aparecem em 3+ reuniões diferentes.
7. **O que ele NUNCA faz** — padrões ausentes que um redator genérico usaria.`;

async function resumirLote(
  rotulo: string,
  m: Metricas,
  falas: string[],
  acumulado: string,
): Promise<string> {
  const prompt = `Lote: ${rotulo}.

${acumulado ? `RESUMO INCREMENTAL DOS LOTES ANTERIORES (mantenha o que continua verdadeiro, corrija o que este lote contradiz):\n${acumulado}\n\n` : ""}${blocoMetricas(m)}

## FALAS DO EDUARDO (anonimizadas, amostradas ao longo do lote)
${amostra(falas, MAX_CHARS_POR_LOTE)}

Produza um RESUMO INCREMENTAL (não o guia final) cobrindo as 7 seções abaixo, com exemplos literais anonimizados e os números que vieram nas métricas. Seja denso; isto vira insumo do lote seguinte.

${SECOES}`;
  return chamarIA(prompt, 8_000);
}

async function guiaFinal(m: Metricas, acumulado: string, falas: string[]): Promise<string> {
  const prompt = `Escreva agora o GUIA FINAL completo.

${acumulado ? `RESUMO CONSOLIDADO DOS LOTES:\n${acumulado}\n\n` : ""}${blocoMetricas(m)}

## FALAS DO EDUARDO (anonimizadas)
${amostra(falas, MAX_CHARS_POR_LOTE)}

Estrutura obrigatória do arquivo:

# Guia de Voz — Eduardo Campos (v1)

Um parágrafo curto de escopo, seguido de uma linha de "Base de evidência" com os números de cobertura.

Depois, as 7 seções, nesta ordem e com estes títulos:

${SECOES}

Cada seção precisa de: exemplos literais anonimizados, os números das métricas, e um bloco final "**Regra prática:**" com a instrução de redação derivada.

Feche com:

## Checklist do redator

Exatamente 10 verificações BINÁRIAS (resposta sim/não) para qualquer texto que saia em nome do Eduardo. Cada uma numerada, uma linha, verificável sem consultar o corpus.`;
  return chamarIA(prompt, 16_000);
}

// ── Espelho de reunião (prompt 2) ───────────────────────────────────────────

const SISTEMA_ESPELHO = `Você escreve o Espelho de Reunião do Eduardo Campos, assessor da Onix Capital.

Tom: ESPELHO, não auditoria. O objetivo é o Eduardo se ver, não se defender. Descreva o que aconteceu, sem julgar a pessoa.

O material JÁ FOI ANONIMIZADO ([cliente], [valor], [situação de saúde], [instituição]). Nunca reconstrua um placeholder. Citação que só funciona com o dado redigido, descarte.

Português do Brasil, markdown, direto.`;

async function espelho(reunioes: ReuniaoCrua[], denylist: string[]): Promise<string> {
  const opcoes = { denylist, allowlist: [VENDEDOR, "Eduardo", "Campos", "Onix"] };
  // Aqui o diálogo importa: objeção é do cliente, resposta é dele, e o que veio
  // DEPOIS é a evidência de ter avançado ou travado. Então mantém o encadeamento.
  const dialogos = reunioes.map((r) => {
    const seg = atribuirEduardo(segmentarTurnos(r.texto), {
      vendedorEhEduardo: r.vendedorEhEduardo,
      participantes: r.participantes,
    });
    const linhas = seg.turnos
      .filter((t) => t.rotulo)
      .map((t) => `${t.ehEduardo ? "EDUARDO" : "INTERLOCUTOR"}: ${anonimizar(t.texto, opcoes).texto}`);
    return `[reunião ${r.data.toISOString().slice(0, 10)}]\n${linhas.join("\n")}`;
  });

  let total = 0;
  const usados: string[] = [];
  for (const d of dialogos) {
    if (total + d.length > MAX_CHARS_POR_LOTE) break;
    usados.push(d);
    total += d.length;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ausente.");
  const client = new Anthropic({ apiKey, timeout: 600_000, maxRetries: 2 });
  const r = await client.messages.create({
    model: MODELO,
    max_tokens: 12_000,
    system: SISTEMA_ESPELHO,
    messages: [{
      role: "user",
      content: `Diálogos anonimizados dos últimos 30 dias (${reunioes.length} reuniões, ${usados.length} incluídas):

${usados.join("\n\n")}

Escreva o arquivo com estas seções:

# Espelho de Reunião — {mês}/{ano}

1. **As 5 objeções mais frequentes do mês** — com a formulação literal (anonimizada) de cada uma.
2. **Como o Eduardo respondeu a cada uma** — e se a conversa AVANÇOU ou TRAVOU depois da resposta. Use o encadeamento do diálogo como evidência: cite o turno seguinte do interlocutor.
3. **Follow-ups prometidos** que não reaparecem em reuniões posteriores.
4. **Três sugestões de abordagem para o próximo mês**, cada uma ancorada num trecho real anonimizado onde o padrão apareceu.`,
    }],
  });
  return r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

// ── Gravação com auditoria ──────────────────────────────────────────────────

async function gravar(destino: string, markdown: string, denylist: string[]) {
  // Segunda passada de anonimização: rede contra o modelo ter reintroduzido algo.
  const limpo = anonimizar(markdown, {
    denylist,
    allowlist: [VENDEDOR, "Eduardo", "Campos", "Onix", "Guia", "Voz", "Checklist", "Regra", "Base"],
  }).texto;

  const vazamentos = auditarVazamento(limpo);
  if (vazamentos.length) {
    console.error("\n❌ ABORTADO — a auditoria de vazamento pegou coisa no arquivo final:");
    for (const v of vazamentos) console.error(`   - ${v}`);
    process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, limpo, "utf8");
  console.log(`\n✅ ${destino} (${limpo.length} chars)`);
}

// ── Main ────────────────────────────────────────────────────────────────────

/** Os quatro números do acervo. Nenhum dado de cliente sai daqui — só contagens. */
function imprimirCenso(desde?: Date) {
  if (!censo) return;
  const c = censo;
  const janela = desde ? ` (desde ${desde.toISOString().slice(0, 10)})` : "";
  console.log(`
══ Censo do acervo${janela} ══
1. Transcrições no banco ......... ${c.transcricoes.total}
     Meeting ..................... ${c.transcricoes.meeting}
     ReuniaoEstruturada .......... ${c.transcricoes.reuniaoEstruturada}
2. Conduzidas por ${VENDEDOR} ... ${c.doEduardo.total}
     com titular no campo vendedor ${c.doEduardo.porTitular}
     só por assinatura no texto .. ${c.doEduardo.porAssinaturaNaTranscricao}
3. Distribuição por trimestre:${
    c.porTrimestre.length
      ? "\n" + c.porTrimestre.map((t) => `     ${t.trimestre} ${"█".repeat(Math.min(40, t.reunioes))} ${t.reunioes}`).join("\n")
      : " (nenhuma)"
  }
4. Sem titular identificado ...... ${c.semTitular.total}
     destas, com o nome dele no texto ${c.semTitular.comAssinaturaDele}`);
}

async function main() {
  const desde = ESPELHO ? new Date(Date.now() - 30 * 86_400_000) : undefined;
  const [reunioes, denylist] = await Promise.all([coletar(desde), montarDenylist()]);

  imprimirCenso(desde);
  console.log(`Denylist de nomes vinda do banco: ${denylist.length} (nunca impressa)`);
  if (!reunioes.length) {
    console.error("Nenhuma reunião encontrada. Nada a fazer.");
    process.exitCode = 1;
    return;
  }

  if (ESPELHO) {
    const md = await espelho(reunioes, denylist);
    const d = new Date();
    const nome = `espelho-reuniao-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}.md`;
    await gravar(path.join("docs", nome), md, denylist);
    return;
  }

  const lotes = lotear(reunioes);
  console.log(`Lotes: ${lotes.length}${lotes.length > 1 ? " (por trimestre)" : ""}`);

  const corpusTotal = montarCorpus(reunioes, denylist);
  const metricasTotais = calcularTudo(corpusTotal);

  console.log("\n── Cobertura ──");
  console.log(JSON.stringify(metricasTotais.cobertura, null, 2));

  if (DRY_RUN) {
    const destino = "docs/.voz-eduardo-metricas.json";
    await mkdir("docs", { recursive: true });
    await writeFile(destino, JSON.stringify(metricasTotais, null, 2), "utf8");
    console.log(`\n(dry-run) métricas em ${destino} — nenhuma chamada à IA, nada gravado no banco.`);
    return;
  }

  let acumulado = "";
  if (lotes.length > 1) {
    for (const [i, lote] of lotes.entries()) {
      const rotulo = `${trimestre(lote[0]!.data)} (${lote.length} reuniões)`;
      console.log(`  [${i + 1}/${lotes.length}] ${rotulo}`);
      const c = montarCorpus(lote, denylist);
      if (!c.eduardo.length) continue;
      acumulado = await resumirLote(rotulo, calcularTudo(c), c.eduardo, acumulado);
    }
  }

  const md = await guiaFinal(metricasTotais, acumulado, corpusTotal.eduardo);
  await gravar("docs/guia-voz-eduardo-v1.md", md, denylist);

  const { cobertura, analogias, assinaturas, jargao } = metricasTotais;
  console.log(`
── Resumo ──
Reuniões lidas: ${cobertura.reunioes} | com fala atribuível a ele: ${cobertura.reunioesComFalaDele}
Turnos dele por confiança: ${JSON.stringify(cobertura.turnosPorConfianca)}
Analogia mais frequente: ${analogias[0]?.tema ?? "—"} (${analogias[0]?.ocorrencias ?? 0}x)
Frases-assinatura em 3+ reuniões: ${assinaturas.length}
Jargões que ele nunca usou: ${jargao.filter((t) => t.eduardo === 0).length}/${jargao.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
