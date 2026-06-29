import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { cockpitReuniaoHabilitado } from "@/lib/cockpit-reuniao/flag";
import {
  CADENCIAS_REUNIAO,
  HORIZONTES_PROJETO,
  type FamiliaEntidade,
  type HorizonteProjeto,
  type IdentidadeExtraida,
  type MemoravelEntidade,
  type MetricaEntidade,
  type ProjetoEntidade,
  type SucessaoEntidade,
} from "@/lib/cockpit-reuniao/tipos";

/**
 * POST /api/cockpit-reuniao/extrair
 *
 * Motor de extração do "Importar reunião". Recebe o resumo bruto (Plaud) e SUGERE
 * os campos operacionais + um snapshot de patrimônio via Claude (tool_use forçado).
 * NÃO grava nada — o front mostra um preview editável e só persiste no clique de
 * "Salvar reunião" (action importarReuniaoEstruturada).
 *
 * Espelha o padrão de sugerir-rice: SDK Anthropic, tool_choice forçado, régua
 * travada no input_schema e revalidação defensiva no servidor.
 *
 * Gate: autenticado + flag COCKPIT_REUNIAO (sem flag nova). Flag OFF → 404.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const PDF_BETA = "pdfs-2024-09-25";
const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB — teto defensivo do upload

const CADENCIA_VALUES = CADENCIAS_REUNIAO.map((c) => c.value);

const EXTRAIR_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    data: {
      type: "string",
      description:
        "Data da reunião no formato ISO yyyy-mm-dd. String vazia se o resumo não disser a data.",
    },
    dataRetorno: {
      type: "string",
      description:
        "Próxima data de retorno / próxima reunião acordada (a MAIS PRÓXIMA), no formato ISO yyyy-mm-dd. String vazia se o resumo não disser. NÃO é a data desta reunião.",
    },
    tipoCadencia: {
      type: "string",
      enum: [...CADENCIA_VALUES],
      description:
        "Cadência da reunião. Use 'outra' se não der pra inferir uma das demais.",
    },
    pautas: {
      type: "array",
      items: { type: "string" },
      description: "Tópicos da pauta tratados na reunião. Vazio se não houver.",
    },
    pendenciasAssessor: {
      type: "array",
      items: { type: "string" },
      description: "O que o ASSESSOR ficou de fazer. Vazio se não houver.",
    },
    pendenciasCliente: {
      type: "array",
      items: { type: "string" },
      description: "O que o CLIENTE ficou de fazer. Vazio se não houver.",
    },
    proximosPassos: {
      type: "array",
      items: { type: "string" },
      description: "Próximos passos acordados. Vazio se não houver.",
    },
    patrimonioSnapshot: {
      type: "object",
      properties: {
        totalBtg: {
          type: "integer",
          minimum: 0,
          description: "Patrimônio no BTG, em reais cheios (ex.: 4000000 = R$ 4 mi).",
        },
        totalForaBtg: {
          type: "integer",
          minimum: 0,
          description: "Patrimônio fora do BTG, em reais cheios.",
        },
        totalGeral: {
          type: "integer",
          minimum: 0,
          description: "Patrimônio total declarado, em reais cheios.",
        },
        observacao: {
          type: "string",
          description: "Observação curta sobre o patrimônio, se houver.",
        },
      },
      additionalProperties: false,
      description:
        "Snapshot do patrimônio declarado. Omita os campos que o resumo não trouxer.",
    },
    identidade: {
      type: "object",
      properties: {
        idade: {
          type: "integer",
          minimum: 0,
          description: "Idade do cliente em anos, se o texto disser um número.",
        },
        profissao: {
          type: "string",
          description: "Profissão / ocupação atual do cliente.",
        },
        origem: {
          type: "string",
          description: "Origem / cidade-natal / de onde veio, se mencionado.",
        },
        estadoCivil: {
          type: "string",
          description: "Estado civil (ex.: casado, solteiro, divorciado, viúvo).",
        },
      },
      additionalProperties: false,
      description:
        "Identidade do PRÓPRIO cliente. Omita os campos que o resumo não trouxer.",
    },
    familia: {
      type: "array",
      description:
        "Pessoas do círculo do cliente citadas (cônjuge, filhos, pais, sócios pessoais). UMA entrada por pessoa. Vazio se não houver.",
      items: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description:
              "Chave estável da pessoa, minúscula e sem acento, ex.: 'familia:gustavo', 'familia:esposa-marina'.",
          },
          nome: {
            type: "string",
            description: "Nome da pessoa (ou o papel, ex.: 'esposa', se não houver nome).",
          },
          resumo: {
            type: "string",
            description: "Resumo curto de quem é / relação com o cliente.",
          },
          detalhe: {
            type: "string",
            description:
              "Detalhes adicionais (idade, profissão, estudos, saúde, etc.), se houver.",
          },
          sensivel: {
            type: "boolean",
            description:
              "true se contiver dado sensível (ex.: saúde/doença de terceiro). Saúde de FAMILIAR entra AQUI com sensivel=true, NUNCA em 'saude'.",
          },
        },
        required: ["chave", "nome", "resumo"],
        additionalProperties: false,
      },
    },
    projetos: {
      type: "array",
      description:
        "Projetos / objetivos de vida do cliente (comprar/vender bem, viagem, aposentadoria, abrir negócio). Vazio se não houver.",
      items: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description:
              "Chave estável, ex.: 'projeto:vender-itacimirim', 'projeto:aposentadoria'.",
          },
          descricao: {
            type: "string",
            description: "Descrição do projeto / objetivo.",
          },
          horizonte: {
            type: "string",
            enum: ["curto", "medio", "longo"],
            description:
              "Horizonte temporal: curto (até 1 ano), medio (1–5 anos), longo (5+ anos). Use o que o texto indicar.",
          },
        },
        required: ["chave", "descricao", "horizonte"],
        additionalProperties: false,
      },
    },
    metricas: {
      type: "array",
      description:
        "Métricas de FLUXO declaradas (despesa, renda, capacidade de poupança). NÃO inclua patrimônio (isso vai no patrimonioSnapshot). Vazio se não houver.",
      items: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description:
              "Chave da métrica, ex.: 'despesaMensal', 'rendaMensal', 'capacidadePoupanca'.",
          },
          valorNumerico: {
            type: "integer",
            minimum: 0,
            description:
              "Valor em REAIS CHEIOS inteiro, quando o texto der número ('R$ 30 mil' → 30000). Omita se for só qualitativo.",
          },
          valorTexto: {
            type: "string",
            description:
              "Valor qualitativo quando NÃO houver número (ex.: 'muito alta', 'baixa'). Omita se houver valorNumerico.",
          },
        },
        required: ["chave"],
        additionalProperties: false,
      },
    },
    memoraveis: {
      type: "array",
      description:
        "Fatos memoráveis / pessoais (aniversários, hobbies, time, datas marcantes, preferências). Vazio se não houver.",
      items: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description: "Chave estável, ex.: 'memoravel:aniversario', 'memoravel:hobby-vela'.",
          },
          descricao: {
            type: "string",
            description: "Descrição do fato memorável.",
          },
          vence: {
            type: "string",
            description:
              "Data ISO yyyy-mm-dd quando o fato tem prazo (ex.: aniversário, vencimento). String vazia se não tiver prazo.",
          },
        },
        required: ["chave", "descricao"],
        additionalProperties: false,
      },
    },
    saude: {
      type: "string",
      description:
        "Saúde do PRÓPRIO cliente (condições, restrições, preocupações). String vazia se não houver. Saúde de TERCEIROS (familiares) NÃO entra aqui — vai na pessoa em 'familia' com sensivel=true.",
    },
    sucessao: {
      type: "array",
      description:
        "Sinais de sucessão / proteção patrimonial e oportunidades de cross-sell (seguro de vida, previdência, testamento, holding, inventário, doação). Vazio se não houver.",
      items: {
        type: "object",
        properties: {
          chave: {
            type: "string",
            description:
              "Chave estável, ex.: 'produto:seguro-vida', 'produto:previdencia', 'risco:inventario', 'estrutura:holding'.",
          },
          descricao: {
            type: "string",
            description: "O que foi dito / a necessidade ou oportunidade identificada.",
          },
        },
        required: ["chave", "descricao"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "data",
    "dataRetorno",
    "tipoCadencia",
    "pautas",
    "pendenciasAssessor",
    "pendenciasCliente",
    "proximosPassos",
    "patrimonioSnapshot",
    "identidade",
    "familia",
    "projetos",
    "metricas",
    "memoraveis",
    "saude",
    "sucessao",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Você extrai dados estruturados do resumo de uma reunião entre assessor de investimentos e cliente (resumos do app Plaud).

Regras de fidelidade (CRÍTICAS):
- Extraia FIELMENTE o que está no texto. NÃO invente, não complete e não deduza nada que não esteja escrito.
- Deixe VAZIO ('', [] ou campo omitido) tudo que o resumo não trouxer explicitamente.
- Separe pendências por lado: o que o ASSESSOR ficou de fazer vs. o que o CLIENTE ficou de fazer.
- Patrimônio: sempre em REAIS CHEIOS, número INTEIRO, convertendo o que o texto disser ("4 milhões" → 4000000; "9 milhões" → 9000000; "R$ 560 mil" → 560000). NUNCA use decimais de milhão (não devolva 4 nem 4.0 para "4 milhões"). Só preencha um total se houver número no texto; omita o campo se não houver.
- Data: formato ISO yyyy-mm-dd. Se o resumo não disser a data, devolva string vazia.
- Datas de retorno / próxima reunião vão em 'dataRetorno' (a MAIS PRÓXIMA, ISO yyyy-mm-dd; string vazia se não houver). 'proximosPassos' é SÓ para AÇÕES acordadas — NUNCA coloque datas de retorno nem "próxima reunião" ali.

Perfil rico (mapeie as seções do resumo para as categorias certas):
- 'identidade': idade, profissão, origem e estado civil do PRÓPRIO cliente.
- 'familia': cada pessoa citada (cônjuge, filhos, pais, sócios pessoais) vira UMA entrada, com chave estável (ex.: 'familia:gustavo'), nome, resumo e detalhe.
- 'projetos': objetivos/planos de vida, com horizonte (curto/medio/longo) conforme o texto.
- 'metricas': fluxo financeiro (despesa, renda, capacidade de poupança). Use 'valorNumerico' (reais cheios, inteiro) QUANDO houver número; senão use 'valorTexto' (qualitativo, ex.: "muito alta"). NUNCA os dois ao mesmo tempo. Patrimônio NÃO é métrica — vai em patrimonioSnapshot.
- 'memoraveis': aniversários, hobbies, time, datas marcantes, preferências. Se tiver prazo/data, preencha 'vence' (ISO yyyy-mm-dd).
- 'saude': SOMENTE a saúde do próprio cliente. Saúde de TERCEIROS (familiares) vai na pessoa correspondente em 'familia' com sensivel=true — NUNCA em 'saude'.
- 'sucessao': sucessão / proteção patrimonial / cross-sell (seguro de vida, previdência, testamento, holding, inventário), com chave (ex.: 'produto:seguro-vida').
- IGNORE seções de "treinamento do assessor" e "mídias sociais" do resumo — não são dados do cliente.

Responda SEMPRE chamando a tool 'extrair_reuniao'.`;

/** Coage para string ISO yyyy-mm-dd válida, ou null se não-parseável. */
function dataIsoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

/** Mantém só strings não-vazias (trim) de um valor que deveria ser string[]. */
function listaTextos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const limpo = item.trim();
    if (limpo) out.push(limpo);
  }
  return out;
}

/** Inteiro de reais >= 0, ou undefined (descarta NaN/Infinity/lixo/negativo). */
function reaisInteiroOrUndef(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(0, Math.trunc(v));
}

/** String não-vazia (trim) ou undefined. */
function strOuUndef(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t ? t : undefined;
}

const HORIZONTES_VALIDOS = HORIZONTES_PROJETO.map((h) => h.value);

// --- Coerções defensivas dos blocos ricos (1b-2a). Não confiar só no schema:
// descartam entidades vazias, normalizam tipos e impõem a régua num/qualitativo. ---

function coerceIdentidade(v: unknown): IdentidadeExtraida {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    idade: reaisInteiroOrUndef(o.idade), // inteiro >= 0
    profissao: strOuUndef(o.profissao),
    origem: strOuUndef(o.origem),
    estadoCivil: strOuUndef(o.estadoCivil),
  };
}

function coerceFamilia(v: unknown): FamiliaEntidade[] {
  if (!Array.isArray(v)) return [];
  const out: FamiliaEntidade[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const chave = strOuUndef(o.chave);
    const nome = strOuUndef(o.nome);
    const resumo = strOuUndef(o.resumo);
    if (!chave && !nome && !resumo) continue; // pessoa vazia: descarta
    out.push({
      chave: chave ?? "",
      nome: nome ?? "",
      resumo: resumo ?? "",
      detalhe: strOuUndef(o.detalhe),
      sensivel: o.sensivel === true,
    });
  }
  return out;
}

function coerceProjetos(v: unknown): ProjetoEntidade[] {
  if (!Array.isArray(v)) return [];
  const out: ProjetoEntidade[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const descricao = strOuUndef(o.descricao);
    if (!descricao) continue;
    const hRaw = typeof o.horizonte === "string" ? o.horizonte.trim() : "";
    const horizonte: HorizonteProjeto = HORIZONTES_VALIDOS.includes(
      hRaw as HorizonteProjeto,
    )
      ? (hRaw as HorizonteProjeto)
      : "medio";
    out.push({ chave: strOuUndef(o.chave) ?? "", descricao, horizonte });
  }
  return out;
}

function coerceMetricas(v: unknown): MetricaEntidade[] {
  if (!Array.isArray(v)) return [];
  const out: MetricaEntidade[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const chave = strOuUndef(o.chave);
    if (!chave) continue;
    // Decisão 16: número tem prioridade; só usa texto se não houver número.
    const valorNumerico = reaisInteiroOrUndef(o.valorNumerico);
    const valorTexto =
      valorNumerico === undefined ? strOuUndef(o.valorTexto) : undefined;
    if (valorNumerico === undefined && !valorTexto) continue; // métrica sem valor: descarta
    out.push({ chave, valorNumerico, valorTexto });
  }
  return out;
}

function coerceMemoraveis(v: unknown): MemoravelEntidade[] {
  if (!Array.isArray(v)) return [];
  const out: MemoravelEntidade[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const descricao = strOuUndef(o.descricao);
    if (!descricao) continue;
    out.push({
      chave: strOuUndef(o.chave) ?? "",
      descricao,
      vence: dataIsoOrNull(o.vence),
    });
  }
  return out;
}

function coerceSucessao(v: unknown): SucessaoEntidade[] {
  if (!Array.isArray(v)) return [];
  const out: SucessaoEntidade[] = [];
  for (const it of v) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const chave = strOuUndef(o.chave);
    const descricao = strOuUndef(o.descricao);
    if (!chave && !descricao) continue; // sinal vazio: descarta
    out.push({ chave: chave ?? "", descricao: descricao ?? "" });
  }
  return out;
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Não vaza existência quando a feature está desligada.
  if (!(await cockpitReuniaoHabilitado())) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }

  // Lê a chave do Config DB (onde a integração "Claude AI" salva), com fallback
  // de env — mesmo padrão de claude-analisar/claude-coletivo/painel-do-dia.
  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada (Integrações › Claude AI)." },
      { status: 500 },
    );
  }

  // Aceita 2 formatos: JSON { texto } (colar) OU multipart com um PDF (campo
  // "file"). Em ambos os casos a rota SÓ extrai — não armazena nada.
  const contentType = req.headers.get("content-type") ?? "";
  let texto = "";
  let hasPdf = false;
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Form inválido." }, { status: 400 });
    }
    const file = form.get("file");
    const textoForm = form.get("texto");
    if (typeof textoForm === "string") texto = textoForm;

    if (file && typeof file === "object" && "arrayBuffer" in file) {
      const f = file as File;
      if (f.type !== "application/pdf") {
        return NextResponse.json(
          { error: "Só PDF é aceito no upload." },
          { status: 400 },
        );
      }
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_PDF_BYTES) {
        return NextResponse.json(
          { error: "PDF vazio ou maior que 25 MB." },
          { status: 400 },
        );
      }
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: buf.toString("base64"),
        },
      });
      hasPdf = true;
    }
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido." }, { status: 400 });
    }
    if (body && typeof body === "object" && "texto" in body) {
      const t = (body as { texto: unknown }).texto;
      if (typeof t === "string") texto = t;
    }
  }

  if (!hasPdf && texto.trim().length === 0) {
    return NextResponse.json(
      { error: "Cole o resumo da reunião ou anexe um PDF." },
      { status: 400 },
    );
  }

  userContent.push({
    type: "text",
    text: hasPdf
      ? `Extraia os campos da reunião a partir do PDF anexo${texto.trim() ? `, complementando com este texto:\n\n---\n${texto.trim()}\n---` : "."}`
      : `Extraia os campos do resumo de reunião abaixo.\n\n---\n${texto.trim()}\n---`,
  });

  const client = new Anthropic({
    apiKey,
    timeout: 55_000,
    maxRetries: 1,
    ...(hasPdf ? { defaultHeaders: { "anthropic-beta": PDF_BETA } } : {}),
  });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: "extrair_reuniao",
          description:
            "Devolve os campos operacionais da reunião (data, data de retorno, cadência, pautas, pendências dos dois lados, próximos passos) + snapshot de patrimônio. Extraídos fielmente do resumo.",
          input_schema: EXTRAIR_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: "extrair_reuniao" },
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    console.error("[cockpit-reuniao/extrair] anthropic error", err);
    return NextResponse.json(
      {
        error: "Falha ao consultar a IA para extrair a reunião.",
        detalhe: err instanceof Error ? err.message : "erro desconhecido",
      },
      { status: 502 },
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return NextResponse.json(
      {
        error: "A IA não retornou uma extração estruturada.",
        stopReason: response.stop_reason,
      },
      { status: 502 },
    );
  }

  const raw = toolUse.input as Record<string, unknown>;

  // Revalidação defensiva no servidor (não confiar só no schema).
  const cadenciaRaw =
    typeof raw.tipoCadencia === "string" ? raw.tipoCadencia : "";
  const tipoCadencia = CADENCIA_VALUES.includes(
    cadenciaRaw as (typeof CADENCIA_VALUES)[number],
  )
    ? cadenciaRaw
    : "outra";

  const patRaw =
    raw.patrimonioSnapshot && typeof raw.patrimonioSnapshot === "object"
      ? (raw.patrimonioSnapshot as Record<string, unknown>)
      : {};
  const patrimonioSnapshot = {
    totalBtg: reaisInteiroOrUndef(patRaw.totalBtg),
    totalForaBtg: reaisInteiroOrUndef(patRaw.totalForaBtg),
    totalGeral: reaisInteiroOrUndef(patRaw.totalGeral),
    observacao:
      typeof patRaw.observacao === "string" && patRaw.observacao.trim()
        ? patRaw.observacao.trim()
        : undefined,
    moeda: "BRL" as const,
  };

  return NextResponse.json({
    data: dataIsoOrNull(raw.data),
    dataRetorno: dataIsoOrNull(raw.dataRetorno),
    tipoCadencia,
    pautas: listaTextos(raw.pautas),
    pendenciasAssessor: listaTextos(raw.pendenciasAssessor),
    pendenciasCliente: listaTextos(raw.pendenciasCliente),
    proximosPassos: listaTextos(raw.proximosPassos),
    patrimonioSnapshot,
    // Blocos ricos (1b-2a) — só extração + preview; nada grava em ClienteFato aqui.
    identidade: coerceIdentidade(raw.identidade),
    familia: coerceFamilia(raw.familia),
    projetos: coerceProjetos(raw.projetos),
    metricas: coerceMetricas(raw.metricas),
    memoraveis: coerceMemoraveis(raw.memoraveis),
    saude: typeof raw.saude === "string" ? raw.saude.trim() : "",
    sucessao: coerceSucessao(raw.sucessao),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  });
}
