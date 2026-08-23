import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";

import { guardAdminApi } from "@/lib/api-admin-guard";
import { getConfig } from "@/lib/config-db";
import { calcularCusto, textoDoDocx } from "@/lib/importacao/extracao-ia";

/**
 * POST /api/empresas/corretora/importar/descobrir
 *
 * Descobre as COLUNAS de um PDF ou Word, para a tela de mapeamento não nascer
 * em branco nesses dois formatos. É a irmã de `sondar`, que faz o mesmo para
 * planilha e CSV lendo o cabeçalho.
 *
 * NÃO GRAVA NADA: nem perfil, nem `ImportJob`, nem contrato. Nenhum arquivo em
 * `src/lib/**` foi tocado — a rota consome `textoDoDocx` e `calcularCusto`, que
 * já eram exportados.
 *
 * ── WORD SAI DE GRAÇA, E ISSO NÃO É DETALHE ─────────────────────────────
 * `textoDoDocx` já descompacta `word/document.xml` preservando `\t` entre
 * células e `\n` entre linhas. A extração de verdade joga esse texto para a IA;
 * para DESCOBRIR coluna basta a primeira linha da primeira tabela. Zero
 * chamada, zero custo, resposta imediata.
 *
 * ── PDF PAGA, MAS PAGA POUCO ────────────────────────────────────────────
 * Só a PRIMEIRA página vai para o modelo, recortada com `pdf-lib`: nomes de
 * coluna moram no cabeçalho, e mandar 40 páginas para descobrir o que está na
 * primeira seria pagar 40× pela mesma informação. Modelo é o Haiku — a tarefa
 * é transcrever cabeçalho, não interpretar. O custo medido volta na resposta.
 *
 * ── POR QUE O `exemplo` VEM JUNTO ───────────────────────────────────────
 * Pedir só o rótulo convida o modelo a completar a lista com o que "costuma
 * ter" num relatório de seguros. Exigir um valor da primeira linha de dados
 * junto de cada rótulo prende cada item a algo que está no papel — e ainda dá
 * à pessoa o que ela precisa para decidir o destino da coluna.
 *
 * ── PDF ESCANEADO, E POR QUE A CONTA DE TOKENS NÃO SERVE ────────────────
 * A tentação é inferir "é digitalizado" de um número baixo de tokens. A conta
 * até anda na direção certa — a API converte TODA página em imagem, e a de
 * texto ainda soma a camada de texto por cima, então a escaneada custa menos —
 * mas o limiar não existe: uma capa de texto curto e uma foto de papel caem na
 * mesma faixa, e é justamente entre esses dois que a tela precisa distinguir.
 *
 * Então quem diz é o modelo, num campo do próprio schema: `motivoVazio`. Ele
 * está olhando a página — sabe separar papel fotografado de capa sem tabela,
 * que é a pergunta real. A tela mostra a razão em vez de um formulário em
 * branco, que a pessoa leria como defeito.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const MODELO = "claude-haiku-4-5";
/**
 * Teto da saída. 2.000 cabia em ~15 colunas e truncava num relatório de 40 —
 * e resposta truncada não volta como "faltou espaço": volta como JSON inválido,
 * erro que aponta para o lugar errado. 4.000 cobre ~60 colunas com exemplo, e o
 * pior caso da conta ainda fica em centavos.
 */
const MAX_TOKENS = 4000;

type Coluna = { rotulo: string; exemplo: string };

const SCHEMA = {
  type: "object",
  properties: {
    motivoVazio: {
      type: ["string", "null"],
      enum: ["documento_digitalizado", "sem_tabela", null],
      description:
        "Preencha SÓ quando `colunas` vier vazia. `documento_digitalizado` = a página é imagem de papel; `sem_tabela` = a página tem texto mas nenhuma tabela (capa, carta).",
    },
    colunas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rotulo: { type: "string" },
          exemplo: { type: "string" },
        },
        required: ["rotulo", "exemplo"],
        additionalProperties: false,
      },
    },
  },
  required: ["colunas", "motivoVazio"],
  additionalProperties: false,
} as const;

const INSTRUCAO = [
  "Este é o começo de um relatório de uma seguradora.",
  "",
  "Liste as COLUNAS da tabela de dados: o rótulo exatamente como está escrito no",
  "documento, e um valor de exemplo tirado da PRIMEIRA linha de dados.",
  "",
  "Regras:",
  "- transcreva, não traduza nem normalize. 'Nº Apólice' continua 'Nº Apólice'.",
  "- toda coluna listada precisa ter um exemplo REAL do documento. Se você não",
  "  encontra o valor, não liste a coluna.",
  "- não complete a lista com colunas que um relatório de seguros costuma ter.",
  "  Só o que está neste documento.",
  "- se não houver tabela nenhuma, devolva a lista vazia e diga em `motivoVazio`",
  "  se a página é imagem de papel digitalizado ou apenas uma página sem tabela.",
].join("\n");

export async function POST(req: NextRequest) {
  const negado = await guardAdminApi("empresas/corretora/importar/descobrir");
  if (negado) return negado;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "corpo inválido — esta rota espera multipart/form-data com o campo `arquivo`" },
      { status: 400 },
    );
  }

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ error: "campo `arquivo` é obrigatório" }, { status: 400 });
  }
  if (arquivo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `arquivo acima do teto de ${MAX_BYTES / 1024 / 1024} MB` },
      { status: 413 },
    );
  }

  const formato = String(form.get("formato") ?? "").trim();
  if (formato !== "pdf" && formato !== "docx") {
    return NextResponse.json(
      { error: "esta rota descobre colunas de PDF e Word. Planilha e CSV usam /sondar." },
      { status: 400 },
    );
  }

  const conteudo = Buffer.from(await arquivo.arrayBuffer());

  if (formato === "docx") {
    try {
      return NextResponse.json(descobrirNoDocx(conteudo));
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      return NextResponse.json({ error: mensagem }, { status: 422 });
    }
  }

  const apiKey = await getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada (Integrações › Claude AI) — PDF depende dela." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await descobrirNoPdf(conteudo, apiKey));
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`[corretora/importar/descobrir] falhou · arquivo=${arquivo.name}`, erro);
    return NextResponse.json({ error: mensagem }, { status: 422 });
  }
}

/**
 * Word: a primeira linha da primeira tabela é o cabeçalho, e a segunda dá os
 * exemplos. Sem IA, porque a estrutura de célula sobrevive à descompactação.
 */
function descobrirNoDocx(conteudo: Buffer) {
  const linhas = textoDoDocx(conteudo)
    .split("\n")
    .map((l) => l.replace(/\t+$/, ""))
    .filter((l) => l.includes("\t"));

  if (linhas.length === 0) {
    return {
      formato: "docx",
      colunas: [] as Coluna[],
      semCamadaDeTexto: false,
      semTabela: true,
      custoUsd: 0,
      // O Word pode ter os dados em parágrafos em vez de tabela. Aí a extração
      // por IA ainda funciona (ela lê o texto inteiro), mas descobrir coluna
      // não: não há coluna.
      aviso: "Não encontrei tabela neste Word. Aponte as colunas à mão ou use um arquivo com tabela.",
    };
  }

  const cabecalho = linhas[0].split("\t").map((c) => c.trim());
  const exemplos = (linhas[1] ?? "").split("\t").map((c) => c.trim());

  const colunas: Coluna[] = cabecalho
    .map((rotulo, i) => ({ rotulo, exemplo: exemplos[i] ?? "" }))
    .filter((c) => c.rotulo !== "");

  return {
    formato: "docx",
    colunas,
    semCamadaDeTexto: false,
    semTabela: false,
    // Zero, e medido: nenhuma chamada de IA acontece neste caminho.
    custoUsd: 0,
    aviso: null,
  };
}

/** PDF: recorta a primeira página e manda só ela. */
async function descobrirNoPdf(conteudo: Buffer, apiKey: string) {
  const original = await PDFDocument.load(conteudo, { ignoreEncryption: true });
  if (original.getPageCount() === 0) {
    throw new Error("PDF sem páginas");
  }

  const recorte = await PDFDocument.create();
  const [primeira] = await recorte.copyPages(original, [0]);
  recorte.addPage(primeira);
  const primeiraPagina = Buffer.from(await recorte.save());

  const cliente = new Anthropic({ apiKey });
  const resposta = await cliente.messages.create({
    model: MODELO,
    max_tokens: MAX_TOKENS,
    output_config: { format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: primeiraPagina.toString("base64"),
            },
          },
          { type: "text", text: INSTRUCAO },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const texto = resposta.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let bruto: { colunas?: Coluna[]; motivoVazio?: string | null };
  try {
    bruto = JSON.parse(texto) as { colunas?: Coluna[]; motivoVazio?: string | null };
  } catch {
    throw new Error("a descoberta não devolveu JSON válido — nada foi lido deste arquivo");
  }

  const custo = calcularCusto(MODELO, resposta.usage.input_tokens, resposta.usage.output_tokens);

  const colunas = (bruto.colunas ?? [])
    .map((c) => ({ rotulo: String(c.rotulo ?? "").trim(), exemplo: String(c.exemplo ?? "").trim() }))
    // Rótulo vazio é ruído; e coluna SEM exemplo é a assinatura do palpite —
    // a instrução manda não listar o que não tem valor no papel.
    .filter((c) => c.rotulo !== "" && c.exemplo !== "");

  // `motivoVazio` só vale quando não veio coluna nenhuma: o modelo às vezes
  // preenche os dois, e a lista de colunas é o fato mais forte dos dois.
  // Caixa normalizada: `enum` no schema não garante a capitalização de volta.
  const motivo = String(bruto.motivoVazio ?? "").trim().toLowerCase();
  const semCamadaDeTexto = colunas.length === 0 && motivo === "documento_digitalizado";

  return {
    formato: "pdf",
    colunas,
    semCamadaDeTexto,
    semTabela: colunas.length === 0 && !semCamadaDeTexto,
    custoUsd: custo.usd,
    modelo: custo.modelo,
    aviso: semCamadaDeTexto
      ? "Este PDF é digitalizado — a página é imagem de papel, sem texto. Não dá para descobrir as colunas: aponte à mão."
      : colunas.length === 0
        ? "Não encontrei tabela na primeira página. Se o relatório começa depois de uma capa, aponte as colunas à mão."
        : null,
  };
}
