import type { Prisma } from "@/generated/prisma/client";

/**
 * Escrita da proveniência de campo — o selo de origem da ficha.
 *
 * UMA linha viva por (cliente, campo): upsert, não append. O extrato histórico
 * já existe em `ClienteFato` e em `RegistroContatoHistorico`; esta tabela
 * responde a pergunta da TELA — "quem escreveu o que está aqui agora?".
 *
 * Toda rota que grava campo editável do cliente chama isto DENTRO da mesma
 * transação. Fora da transação, um erro na segunda escrita deixaria o campo
 * com valor novo e selo velho — e selo errado é pior que selo nenhum: ele
 * afirma com confiança que a IA não escreveu ali.
 */

/** As origens possíveis. Mesmo vocabulário de `ClienteFato.fonte`, de propósito. */
export const ORIGENS = ["manual", "reuniao", "ia", "base_btg", "informacoes", "api"] as const;
export type OrigemCampo = (typeof ORIGENS)[number];

/** Rótulo curto do selo — o que aparece ao lado do campo. */
export const ROTULO_ORIGEM: Record<OrigemCampo, string> = {
  manual: "Você escreveu",
  reuniao: "Veio da reunião",
  ia: "Sugerido pela IA",
  base_btg: "Base BTG",
  informacoes: "Relatório Informações",
  api: "API BTG",
};

/** Teto do resumo guardado. O campo serve para a tela dizer "mudou", não para reler o texto. */
const MAX_RESUMO = 160;

export function resumirValor(valor: string | null | undefined): string | null {
  if (valor == null) return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.length <= MAX_RESUMO ? limpo : `${limpo.slice(0, MAX_RESUMO - 1)}…`;
}

/**
 * Endereço estável do campo. Um único lugar monta a chave para que a leitura
 * (a tela) e a escrita (as rotas) nunca divirjam por um ponto ou dois-pontos.
 */
export const campoDe = {
  cliente: (nome: string) => nome,
  descoberta: (nome: string) => `descoberta.${nome}`,
  meta: (id: string) => `meta:${id}`,
  eventoVida: (id: string) => `eventoVida:${id}`,
} as const;

/** Cliente Prisma ou o handle de transação — as rotas sempre passam o `tx`. */
type Executor = Pick<Prisma.TransactionClient, "campoProveniencia">;

/**
 * Grava (ou atualiza) o selo de um campo.
 *
 * `registradoEm` é sempre reescrito no update: um campo reescrito hoje com o
 * mesmo valor continua sendo uma decisão de hoje, e o selo tem que dizer isso.
 */
export async function registrarProveniencia(
  tx: Executor,
  entrada: {
    clienteId: string;
    campo: string;
    origem: OrigemCampo;
    valor?: string | null;
    reuniaoId?: string | null;
    sugestaoId?: string | null;
    autorUserId?: string | null;
  },
): Promise<void> {
  const comum = {
    origem: entrada.origem,
    valorResumo: resumirValor(entrada.valor),
    reuniaoId: entrada.reuniaoId ?? null,
    sugestaoId: entrada.sugestaoId ?? null,
    autorUserId: entrada.autorUserId ?? null,
  };

  await tx.campoProveniencia.upsert({
    where: { clienteId_campo: { clienteId: entrada.clienteId, campo: entrada.campo } },
    create: { clienteId: entrada.clienteId, campo: entrada.campo, ...comum },
    update: { ...comum, registradoEm: new Date() },
  });
}

/** Vários campos de uma vez (o caso de "Salvar" numa aba inteira). */
export async function registrarProvenienciaEmLote(
  tx: Executor,
  clienteId: string,
  origem: OrigemCampo,
  campos: Record<string, string | null | undefined>,
  extra?: { reuniaoId?: string | null; sugestaoId?: string | null; autorUserId?: string | null },
): Promise<void> {
  for (const [campo, valor] of Object.entries(campos)) {
    // Campo que o formulário nem enviou não recebe selo — `undefined` é
    // "não mexi", diferente de `null`, que é "apaguei de propósito".
    if (valor === undefined) continue;
    await registrarProveniencia(tx, { clienteId, campo, origem, valor, ...extra });
  }
}
