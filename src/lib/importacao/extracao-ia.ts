/* ──────────────────────────────────────────────────────────────
 * Extração por IA — PDF e Word, e SÓ eles.
 *
 * ── POR QUE ESTES DOIS, E POR QUE NÃO OS OUTROS ─────────────────────────
 * PDF e Word não têm estrutura declarada: a "tabela" é um acidente de
 * posicionamento, e a mesma corretora muda o layout entre um relatório e o
 * seguinte. É o caso em que ler prováveis é melhor que não ler.
 *
 * Planilha é o oposto: a coluna tem nome, a célula tem endereço. Mandar Excel
 * para um modelo trocaria uma leitura EXATA por uma provável, e pagaria por
 * isso. O despacho em `extracao.ts` é quem garante a separação; este arquivo
 * nunca é carregado no caminho de planilha.
 *
 * ── O QUE O MODELO PODE E NÃO PODE FAZER ────────────────────────────────
 * Ele TRANSCREVE. O schema de saída é construído a partir dos rótulos do
 * perfil, então o modelo não escolhe nomes de campo, não inventa coluna e não
 * traduz vocabulário — "Ramo" continua "Ramo", e quem decide que "Ramo: AUTO
 * FÁCIL" vira o produto `auto` é o dicionário do perfil, código
 * determinístico, depois daqui.
 *
 * Célula ilegível vira string vazia, JAMAIS um chute: a linha é rejeitada com
 * motivo mais adiante, e isso é o resultado desejado.
 * ────────────────────────────────────────────────────────────── */

import Anthropic from "@anthropic-ai/sdk";
import AdmZip from "adm-zip";

import type {
  ArquivoEntrada,
  CustoExtracao,
  LinhaExtraida,
  OpcoesExtracao,
  ResultadoExtracao,
} from "./extracao";
import type { PerfilImportacaoConfig } from "./perfil";

const MODELO_PADRAO = "claude-opus-5";
const MAX_TOKENS = 16000;

/** USD por 1M de tokens. Tabela pública, fixada aqui para o custo ser MEDIDO. */
const PRECO_POR_MILHAO: Readonly<Record<string, { entrada: number; saida: number }>> = {
  "claude-opus-5": { entrada: 5, saida: 25 },
  "claude-sonnet-5": { entrada: 3, saida: 15 },
  "claude-sonnet-4-6": { entrada: 3, saida: 15 },
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
};

/** 32 MB é o teto do request da API; 20 MB é o teto defensivo daqui. */
const MAX_BYTES = 20 * 1024 * 1024;

export function calcularCusto(
  modelo: string,
  tokensEntrada: number,
  tokensSaida: number,
): CustoExtracao {
  // Modelo fora da tabela custa 0 declarado em vez de um preço chutado: número
  // inventado num relatório de custo é pior que número ausente.
  const preco = PRECO_POR_MILHAO[modelo] ?? { entrada: 0, saida: 0 };
  const usd = (tokensEntrada / 1_000_000) * preco.entrada + (tokensSaida / 1_000_000) * preco.saida;
  return { modelo, tokensEntrada, tokensSaida, usd: Number(usd.toFixed(6)) };
}

/**
 * Texto do .docx, sem IA: `word/document.xml` é XML dentro de um zip.
 *
 * Isto NÃO é a extração — é descompactação. A estruturação em linhas continua
 * sendo do modelo; o que se faz aqui é entregar a ele o texto em vez de bytes
 * comprimidos, preservando a fronteira de linha e de célula da tabela, que é
 * a única pista de estrutura que o formato dá.
 */
export function textoDoDocx(conteudo: Buffer): string {
  const zip = new AdmZip(conteudo);
  const entrada = zip.getEntry("word/document.xml");
  if (!entrada) throw new Error("arquivo .docx sem word/document.xml — não parece um Word");
  const xml = entrada.getData().toString("utf8");
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    // Ordem importa: o parágrafo que FECHA uma célula some junto com ela. Sem
    // isto, cada célula viraria uma linha e uma tabela de 10 colunas × 6 linhas
    // chegaria ao modelo como 60 linhas soltas, sem nenhuma estrutura.
    .replace(/(<\/w:p>)+<\/w:tc>/g, "\t")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * O schema de saída, montado a partir dos rótulos do PERFIL.
 *
 * É o ponto de controle do arquivo: o modelo só consegue devolver as chaves que
 * o perfil declarou. Coluna inventada não tem onde caber.
 */
export function schemaDeSaida(perfil: PerfilImportacaoConfig): Record<string, unknown> {
  const rotulos = Object.keys(perfil.mapeamentoColunas);
  const propriedades: Record<string, unknown> = {};
  for (const rotulo of rotulos) {
    propriedades[rotulo] = {
      type: "string",
      description: `Valor de "${rotulo}" exatamente como aparece no documento. String vazia se o documento não trouxer.`,
    };
  }
  return {
    type: "object",
    properties: {
      linhas: {
        type: "array",
        description: "Uma entrada por registro do documento, na ordem em que aparecem.",
        items: { type: "object", properties: propriedades, required: rotulos, additionalProperties: false },
      },
    },
    required: ["linhas"],
    additionalProperties: false,
  };
}

function instrucao(perfil: PerfilImportacaoConfig, arquivo: string): string {
  const rotulos = Object.keys(perfil.mapeamentoColunas);
  const pistas =
    perfil.extracao.tipo === "pdf" && perfil.extracao.estrategia === "regex"
      ? `\nPadrões que a fonte costuma usar (pista, não obrigação):\n${Object.entries(
          perfil.extracao.padroes,
        )
          .map(([r, p]) => `- ${r}: ${p}`)
          .join("\n")}`
      : "";

  return [
    `Você está TRANSCREVENDO o documento "${arquivo}" para uma tabela. Não interprete, não resuma, não converta unidade, não corrija o que estiver escrito.`,
    "",
    "Regras, em ordem de importância:",
    "1. Um registro do documento = uma entrada em `linhas`. Se o documento tem um registro só, devolva uma entrada só.",
    "2. Copie o texto COMO ESTÁ. Não normalize data, não tire pontuação de documento, não traduza rótulo de produto ou de situação.",
    "3. Campo que o documento não traz, ou que você não consegue ler com certeza, vai como string vazia. NUNCA deduza a partir dos outros campos nem repita o valor de outra linha.",
    "4. Não invente registro. Se a tabela tem 12 linhas, devolva 12.",
    "",
    `Campos a preencher: ${rotulos.map((r) => JSON.stringify(r)).join(", ")}.`,
    pistas,
  ].join("\n");
}

export async function extrairPorIa(
  arquivo: ArquivoEntrada,
  perfil: PerfilImportacaoConfig,
  opcoes: OpcoesExtracao = {},
): Promise<ResultadoExtracao> {
  const formato = perfil.formato;
  if (formato !== "pdf" && formato !== "docx") {
    // Guarda redundante com o despacho, de propósito: se um dia alguém chamar
    // esta função direto, a regra "planilha nunca passa por IA" continua valendo.
    throw new Error(`extração por IA é só para PDF e Word — recebeu ${JSON.stringify(formato)}`);
  }
  if (!opcoes.apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada (Integrações › Claude AI) — PDF e Word dependem dela.");
  }
  if (arquivo.conteudo.byteLength > MAX_BYTES) {
    throw new Error(
      `arquivo de ${(arquivo.conteudo.byteLength / 1024 / 1024).toFixed(1)} MB acima do teto de ${MAX_BYTES / 1024 / 1024} MB`,
    );
  }

  const modelo = opcoes.modelo ?? MODELO_PADRAO;
  const cliente = new Anthropic({ apiKey: opcoes.apiKey });
  const avisos: string[] = [];

  const conteudoUsuario: Anthropic.ContentBlockParam[] =
    formato === "pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: arquivo.conteudo.toString("base64"),
            },
          },
          { type: "text", text: instrucao(perfil, arquivo.nome) },
        ]
      : [
          { type: "text", text: textoDoDocx(arquivo.conteudo) },
          { type: "text", text: instrucao(perfil, arquivo.nome) },
        ];

  const resposta = await cliente.messages.create({
    model: modelo,
    max_tokens: MAX_TOKENS,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: schemaDeSaida(perfil) as Record<string, unknown> },
    },
    messages: [{ role: "user", content: conteudoUsuario }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let bruto: { linhas?: Array<Record<string, unknown>> };
  try {
    bruto = JSON.parse(texto) as { linhas?: Array<Record<string, unknown>> };
  } catch {
    throw new Error("a extração por IA não devolveu JSON válido — nada foi lido deste arquivo");
  }

  const custo = calcularCusto(modelo, resposta.usage.input_tokens, resposta.usage.output_tokens);
  const rotulos = Object.keys(perfil.mapeamentoColunas);

  const linhas: LinhaExtraida[] = (bruto.linhas ?? []).map((registro, i) => {
    const celulas: Record<string, string> = {};
    for (const rotulo of rotulos) {
      const v = registro[rotulo];
      celulas[rotulo] = v == null ? "" : String(v).trim();
    }
    // `numero` aqui é a POSIÇÃO no documento, não a linha física: PDF não tem
    // linha física estável. O relatório diz "registro 3 do arquivo X", que é o
    // suficiente para achar à mão.
    return { numero: i + 1, celulas, origem: "ia" };
  });

  if (linhas.length === 0) avisos.push("a extração por IA não encontrou nenhum registro");

  return { formato, arquivo: arquivo.nome, linhas, custo, avisos };
}
