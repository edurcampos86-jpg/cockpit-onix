import "server-only";
import { prisma } from "@/lib/prisma";
import { claudeJson } from "./claude-helpers";
import { normalizarTitulo } from "./agregador";
import type { EmailAcao, QuadrantePM } from "./types";

/**
 * Sug 4 — Triagem AI de e-mails.
 *
 * Roda a cada 15 min. Para cada e-mail no cache ms-mail que ainda não foi
 * classificado (PainelEmailAI), chama o Claude com um prompt estruturado que
 * retorna { tipo, urgencia, quadranteSugerido, tituloAcao, venceSugerido,
 * clienteVinculadoId }.
 *
 * O objetivo não é responder pelo Eduardo — é reduzir o custo de decisão:
 *  - "ação" / "alta" em Q1 aparece com badge vermelho no card de e-mails
 *  - "spam" / "fyi" fica cinza (pode ser arquivado em lote)
 *  - "cliente_novo" tenta vincular ao ClienteBackoffice por similaridade do nome
 *  - O botão "✨ Criar ação" usa a classificação para já preencher quadrante,
 *    título e vence.
 */

type ClassificacaoLLM = {
  tipo: "acao" | "fyi" | "spam" | "agendamento" | "cliente_novo";
  urgencia: "alta" | "media" | "baixa";
  quadranteSugerido: QuadrantePM | null;
  tituloAcao: string | null;
  venceSugerido: string | null; // ISO date or null
  clienteNomeSugerido: string | null;
};

const LIMITE_POR_RODADA = 20; // evita estourar a quota do Claude

const SYSTEM_PROMPT = `Você é o assistente de triagem de e-mails de um assessor de investimentos brasileiro
(Eduardo Campos, Onix Investimentos). Classifique cada e-mail em JSON estrito sem
texto extra. Regras:
- tipo: "acao" (pede resposta/tarefa), "fyi" (só informativo), "spam" (promocional),
  "agendamento" (quer marcar reunião), "cliente_novo" (lead vindo de indicação).
- urgencia: "alta" (hoje), "media" (semana), "baixa" (quando puder).
- quadranteSugerido Eisenhower: Q1=importante+urgente, Q2=importante+não-urgente,
  Q3=urgente+não-importante, Q4=nenhum. Use null para spam/fyi.
- tituloAcao: frase imperativa curta em português. Null se tipo=spam ou fyi.
- venceSugerido: ISO date (YYYY-MM-DD) só se detectar prazo claro. Senão null.
- clienteNomeSugerido: nome do cliente se for claramente de um cliente
  (remetente conhecido ou menção explícita). Senão null.
Retorne apenas JSON válido, sem comentários.`;

async function classificar(
  email: EmailAcao
): Promise<ClassificacaoLLM | null> {
  const user = `E-mail para classificar:
Remetente: ${email.remetente}
Assunto: ${email.assunto}
Trecho: ${email.snippet}

Responda em JSON:
{
  "tipo": "...",
  "urgencia": "...",
  "quadranteSugerido": "Q1"|"Q2"|"Q3"|"Q4"|null,
  "tituloAcao": "..."|null,
  "venceSugerido": "YYYY-MM-DD"|null,
  "clienteNomeSugerido": "..."|null
}`;

  return await claudeJson<ClassificacaoLLM>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 400,
  });
}

async function indiceClientes(): Promise<Map<string, string>> {
  const rows = await prisma.clienteBackoffice.findMany({
    select: { id: true, nome: true },
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    const chave = normalizarTitulo(r.nome);
    if (chave.length >= 3) m.set(chave, r.id);
  }
  return m;
}

function vincularCliente(
  nomeSugerido: string | null,
  indice: Map<string, string>
): string | undefined {
  if (!nomeSugerido) return undefined;
  const norm = normalizarTitulo(nomeSugerido);
  if (norm.length < 3) return undefined;
  // Exato
  const direto = indice.get(norm);
  if (direto) return direto;
  // Prefixo / contains
  for (const [chave, id] of indice) {
    if (chave.includes(norm) || norm.includes(chave)) return id;
  }
  return undefined;
}

export async function processarTriagem(userId: string): Promise<{
  classificados: number;
  pulados: number;
  erros: number;
}> {
  const cache = await prisma.painelCacheExterno.findFirst({
    where: { userId, source: "ms-mail" },
  });
  if (!cache) return { classificados: 0, pulados: 0, erros: 0 };

  const emails = (cache.payload as EmailAcao[] | undefined) ?? [];
  if (emails.length === 0) return { classificados: 0, pulados: 0, erros: 0 };

  // IDs já classificados
  const existentes = await prisma.painelEmailAI.findMany({
    where: { userId, externoId: { in: emails.map((e) => e.id) } },
    select: { externoId: true },
  });
  const jaClassificados = new Set(existentes.map((e) => e.externoId));

  const clientes = await indiceClientes();

  let classificados = 0;
  let pulados = 0;
  let erros = 0;

  for (const email of emails) {
    if (jaClassificados.has(email.id)) {
      pulados++;
      continue;
    }
    if (classificados >= LIMITE_POR_RODADA) break;

    try {
      const cls = await classificar(email);
      if (!cls) {
        erros++;
        continue;
      }

      const clienteVinculadoId = vincularCliente(
        cls.clienteNomeSugerido,
        clientes
      );

      await prisma.painelEmailAI.create({
        data: {
          userId,
          externoId: email.id,
          remetente: email.remetente,
          assunto: email.assunto,
          snippet: email.snippet,
          tipo: cls.tipo,
          urgencia: cls.urgencia,
          quadranteSugerido: cls.quadranteSugerido ?? null,
          tituloAcao: cls.tituloAcao ?? null,
          venceSugerido: cls.venceSugerido
            ? new Date(cls.venceSugerido)
            : null,
          clienteVinculadoId,
        },
      });
      classificados++;
    } catch (e) {
      console.error("[triar-emails]", email.id, e);
      erros++;
    }
  }

  return { classificados, pulados, erros };
}

/**
 * Converte um PainelEmailAI classificado numa AcaoPainel em Q2/Q1 conforme
 * sugestão. Marca o e-mail como processado + vincula ID da ação gerada.
 */
export async function criarAcaoDeEmail(
  userId: string,
  aiId: string
): Promise<{ acaoId: string }> {
  const email = await prisma.painelEmailAI.findFirst({
    where: { id: aiId, userId },
  });
  if (!email) throw new Error("email AI nao encontrado");
  if (email.processado && email.acaoGeradaId) {
    return { acaoId: email.acaoGeradaId };
  }

  const acao = await prisma.acaoPainel.create({
    data: {
      userId,
      titulo: email.tituloAcao ?? email.assunto,
      origem: "local",
      quadrante: email.quadranteSugerido ?? undefined,
      importante:
        email.quadranteSugerido === "Q1" || email.quadranteSugerido === "Q2",
      noMeuDia: email.urgencia === "alta",
      vence: email.venceSugerido ?? undefined,
      clienteVinculadoId: email.clienteVinculadoId ?? undefined,
      criadaDeEmailId: email.id,
    },
  });

  await prisma.painelEmailAI.update({
    where: { id: aiId },
    data: { processado: true, acaoGeradaId: acao.id },
  });

  return { acaoId: acao.id };
}
