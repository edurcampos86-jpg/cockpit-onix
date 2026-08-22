import Anthropic from "@anthropic-ai/sdk";
import type { Tool } from "@anthropic-ai/sdk/resources/messages";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { guardaRegistroRico } from "@/lib/clientes-registro/guarda";
import { CAMPOS_DESTINO, destinoValido, rotuloDe } from "@/lib/clientes-registro/sugestoes";

/**
 * POST /api/backoffice/clientes/[id]/reuniao/[reuniaoId]/importar-transcricao
 *
 * Importa a transcrição de uma reunião e produz SUGESTÕES pendentes.
 *
 * ── A regra que justifica a rota inteira ──
 * NADA daqui chega a campo de cliente. Cada achado vira uma linha `pendente`
 * em `SugestaoExtraida` e só entra na ficha quando alguém aceita, uma por uma,
 * no painel de revisão. O motivo é o texto: transcrição é fala transcrita por
 * máquina, com nome errado, número mal ouvido e ironia lida ao pé da letra.
 * Escrever direto colocaria isso no perfil do cliente com cara de fato apurado.
 *
 * Grava, na mesma transação: um `ReuniaoImport` (o rastro do que entrou, que
 * sobrevive ao descarte das sugestões) e as N sugestões pendentes.
 *
 * Body: { texto: string, nomeArquivo?: string }
 * Gate: flag CLIENTES_REGISTRO_RICO + RBAC do cliente.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-opus-5";
const MAX_TOKENS = 8192;
/** Teto do texto aceito. Transcrição de reunião longa passa disso e vira custo sem retorno. */
const MAX_CARACTERES = 120_000;

/**
 * Régua da extração, derivada de `CAMPOS_DESTINO`.
 *
 * O enum sai do MESMO array que a rota de aceite valida. Escrever a lista duas
 * vezes é o modo garantido de o modelo passar a devolver um destino que a
 * gravação recusa — e o sintoma seria "a IA não sugere mais nada de família",
 * sem erro em lugar nenhum.
 */
const PARES_VALIDOS = CAMPOS_DESTINO.map((c) => `${c.destino}.${c.campo}`);

// Tipado como `Tool` (e não `as const`): o SDK espera `required: string[]`
// mutável, e `as const` o congela em readonly — o que rejeita a chamada inteira.
const EXTRAIR_TOOL: Tool = {
  name: "registrar_sugestoes",
  description:
    "Registra os achados da transcrição como sugestões pendentes de revisão humana.",
  input_schema: {
    type: "object" as const,
    properties: {
      sugestoes: {
        type: "array",
        description:
          "Um item por achado. Vazio é resposta válida e preferível a inventar: reunião sobre operação corriqueira não produz sugestão nenhuma.",
        items: {
          type: "object",
          properties: {
            par: {
              type: "string",
              enum: PARES_VALIDOS,
              description: "Campo destino, no formato destino.campo.",
            },
            valor: {
              type: "string",
              description:
                "O texto a gravar no campo, já redigido como nota de ficha — não como transcrição.",
            },
            trecho: {
              type: "string",
              description:
                "Trecho LITERAL da transcrição que embasa o achado, para o revisor conferir sem reler tudo.",
            },
            confianca: {
              type: "number",
              description: "0 a 1. Abaixo de 0,5 quando o achado depende de interpretação.",
            },
          },
          required: ["par", "valor", "trecho"],
          additionalProperties: false,
        },
      },
    },
    required: ["sugestoes"],
    additionalProperties: false,
  },
};

const SISTEMA = `Você lê a transcrição de uma reunião entre um assessor de investimentos e seu cliente e extrai o que merece ir para a ficha do cliente.

Regras:
- Só registre o que foi DITO. Não deduza profissão, patrimônio ou estado civil a partir de indícios.
- Prefira devolver menos. Uma lista vazia é resposta correta para reunião operacional.
- O campo "valor" é uma nota de ficha: frase curta, terceira pessoa, sem "o cliente disse que".
- O campo "trecho" é literal da transcrição. Se não houver trecho literal que sustente, não registre o achado.
- Tarefa é compromisso com dono e ação ("enviar o extrato do INSS"), não intenção vaga.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reuniaoId: string }> },
) {
  try {
    const { id, reuniaoId } = await params;
    const guarda = await guardaRegistroRico(id);
    if (guarda.erro) return guarda.erro;

    const body = (await req.json()) as { texto?: string; nomeArquivo?: string };
    const texto = body.texto?.trim();
    if (!texto) return NextResponse.json({ error: "Texto da transcrição vazio" }, { status: 400 });
    if (texto.length > MAX_CARACTERES) {
      return NextResponse.json(
        { error: `Transcrição muito longa (máx. ${MAX_CARACTERES} caracteres)` },
        { status: 400 },
      );
    }

    // A reunião tem que ser DESTE cliente. Sem esta conferência, o id da rota
    // seria decorativo e uma reunião de outra conta poderia receber sugestões.
    const reuniao = await prisma.reuniaoEstruturada.findFirst({
      where: { id: reuniaoId, clienteId: id },
      select: { id: true },
    });
    if (!reuniao) {
      return NextResponse.json({ error: "Reunião não encontrada para este cliente" }, { status: 404 });
    }

    const apiKey = (await getConfig("ANTHROPIC_API_KEY")) || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Extração indisponível: chave não configurada" }, { status: 503 });
    }

    const client = new Anthropic({ apiKey });
    const resposta = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SISTEMA,
      tools: [EXTRAIR_TOOL],
      tool_choice: { type: "tool", name: EXTRAIR_TOOL.name },
      messages: [{ role: "user", content: `Transcrição da reunião:\n\n${texto}` }],
    });

    const bloco = resposta.content.find((b) => b.type === "tool_use");
    if (!bloco || bloco.type !== "tool_use") {
      return NextResponse.json({ error: "A extração não devolveu resultado" }, { status: 502 });
    }

    // Revalidação defensiva no servidor. O `enum` do input_schema já restringe,
    // mas ele é uma instrução ao modelo, não uma garantia do banco — e o que
    // vem daqui vira, um clique depois, escrita em campo de cliente.
    const bruto = bloco.input as { sugestoes?: unknown };
    const itens = Array.isArray(bruto?.sugestoes) ? bruto.sugestoes : [];

    const validas: { destino: string; campo: string; rotulo: string; valor: string; trecho: string | null; confianca: number | null }[] = [];
    let recusadas = 0;

    for (const item of itens) {
      if (!item || typeof item !== "object") { recusadas++; continue; }
      const i = item as { par?: unknown; valor?: unknown; trecho?: unknown; confianca?: unknown };
      const par = typeof i.par === "string" ? i.par : "";
      const [destino, campo] = par.split(".", 2);
      const valor = typeof i.valor === "string" ? i.valor.trim() : "";
      if (!destino || !campo || !valor || !destinoValido(destino, campo)) { recusadas++; continue; }
      const conf = typeof i.confianca === "number" && i.confianca >= 0 && i.confianca <= 1 ? i.confianca : null;
      validas.push({
        destino,
        campo,
        rotulo: rotuloDe(destino, campo) ?? campo,
        valor,
        trecho: typeof i.trecho === "string" && i.trecho.trim() ? i.trecho.trim() : null,
        confianca: conf,
      });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const importacao = await tx.reuniaoImport.create({
        data: {
          clienteId: id,
          reuniaoEstruturadaId: reuniaoId,
          fonte: "texto",
          textoBruto: texto,
          nomeArquivo: body.nomeArquivo?.trim() || null,
          importadoPor: guarda.userId,
        },
      });

      if (validas.length > 0) {
        await tx.sugestaoExtraida.createMany({
          data: validas.map((v) => ({
            clienteId: id,
            reuniaoId,
            importacaoId: importacao.id,
            destino: v.destino,
            campo: v.campo,
            rotulo: v.rotulo,
            valorSugerido: v.valor,
            trecho: v.trecho,
            confianca: v.confianca,
          })),
        });
      }

      const sugestoes = await tx.sugestaoExtraida.findMany({
        where: { importacaoId: importacao.id },
        orderBy: { criadoEm: "asc" },
      });

      return { importacao, sugestoes };
    });

    return NextResponse.json(
      {
        importacaoId: resultado.importacao.id,
        sugestoes: resultado.sugestoes,
        // Contadores explícitos: "0 sugestões" e "8 sugestões, 3 recusadas" são
        // situações diferentes e a tela precisa poder dizer qual foi.
        totalSugeridas: itens.length,
        totalGravadas: resultado.sugestoes.length,
        totalRecusadasPelaRegua: recusadas,
        camposDoCliente: "nenhum — sugestões nascem pendentes",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Erro ao importar transcrição:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
