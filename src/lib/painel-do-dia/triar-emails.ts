import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { claudeJson } from "./claude-helpers";
import { hojeBahia, normalizarTitulo } from "./agregador";
import type { EmailAcao, EventoSugerido, QuadrantePM } from "./types";

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
  eventoSugerido: EventoSugerido | null;
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
- eventoSugerido: se este e-mail combina ou propõe uma reunião/conversa em
  HORÁRIO ESPECÍFICO (ex.: "quinta 15h", "amanhã às 10", "podemos falar
  segunda 14h?"), devolva { titulo, inicioISO, fimISO, participantes, local? }.
  Senão devolva null.
  · timezone America/Bahia (UTC-3, sem horário de verão). inicioISO/fimISO
    devem incluir o offset "-03:00".
  · se a data é ambígua ("amanhã", "segunda", "quinta"), interprete relativo
    a HOJE (informado no input).
  · se o horário está AUSENTE ou impreciso ("conversar essa semana", "quando
    puder"), NÃO sugira evento — devolva null.
  · participantes: lista de e-mails (use o remetente; só inclua outros se
    explicitamente mencionados).
  · fimISO: se duração não for clara, assuma 30 minutos.
  · local: só se mencionado (endereço físico, sala, ou "Google Meet").
Retorne apenas JSON válido, sem comentários.`;

async function classificar(
  email: EmailAcao
): Promise<ClassificacaoLLM | null> {
  const dataAtual = hojeBahia(); // YYYY-MM-DD em America/Bahia
  const user = `HOJE = ${dataAtual} (America/Bahia, UTC-3)

E-mail para classificar:
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
  "clienteNomeSugerido": "..."|null,
  "eventoSugerido": {
    "titulo": "...",
    "inicioISO": "YYYY-MM-DDTHH:mm:ss-03:00",
    "fimISO": "YYYY-MM-DDTHH:mm:ss-03:00",
    "participantes": ["email@dominio.com"],
    "local": "..."|null
  }|null
}`;

  return await claudeJson<ClassificacaoLLM>({
    system: SYSTEM_PROMPT,
    user,
    maxTokens: 600,
  });
}

/**
 * Valida a sugestão de evento devolvida pelo Claude. Se algum campo
 * essencial estiver faltando ou as datas não fizerem sentido, devolve
 * null — assim a coluna fica NULL e a UI não mostra um card quebrado.
 */
function sanitizarEventoSugerido(
  raw: EventoSugerido | null | undefined
): EventoSugerido | null {
  if (!raw || typeof raw !== "object") return null;
  const titulo = typeof raw.titulo === "string" ? raw.titulo.trim() : "";
  const inicioISO = typeof raw.inicioISO === "string" ? raw.inicioISO : "";
  const fimISO = typeof raw.fimISO === "string" ? raw.fimISO : "";
  if (!titulo || !inicioISO || !fimISO) return null;
  const inicio = new Date(inicioISO);
  const fim = new Date(fimISO);
  if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) return null;
  if (fim.getTime() <= inicio.getTime()) return null;
  const participantes = Array.isArray(raw.participantes)
    ? raw.participantes.filter((p): p is string => typeof p === "string" && p.length > 0)
    : [];
  const local =
    typeof raw.local === "string" && raw.local.trim().length > 0
      ? raw.local.trim()
      : undefined;
  return { titulo, inicioISO, fimISO, participantes, local };
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

/**
 * Triagem genérica de uma lista de e-mails em memória. Usada para o Gmail
 * (que não passa por PainelCacheExterno) e como núcleo da triagem ms-mail.
 *
 * Faz dedupe por (userId, externoId): só passa pelo Claude o que ainda não
 * está em PainelEmailAI.
 */
export async function processarTriagemEmails(
  userId: string,
  emails: EmailAcao[]
): Promise<{ classificados: number; pulados: number; erros: number }> {
  if (emails.length === 0) return { classificados: 0, pulados: 0, erros: 0 };

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

      const eventoSugerido = sanitizarEventoSugerido(cls.eventoSugerido);

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
          eventoSugeridoJson: eventoSugerido
            ? (eventoSugerido as unknown as Prisma.InputJsonValue)
            : undefined,
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
  return processarTriagemEmails(userId, emails);
}

export async function arquivarEmailAI(
  userId: string,
  aiId: string
): Promise<void> {
  const email = await prisma.painelEmailAI.findFirst({
    where: { id: aiId, userId },
    select: { id: true },
  });
  if (!email) throw new Error("email AI nao encontrado");
  await prisma.painelEmailAI.update({
    where: { id: aiId },
    data: { arquivado: true },
  });
}

/**
 * Converte um PainelEmailAI classificado numa AcaoPainel em Q2/Q1 conforme
 * sugestão. Marca o e-mail como processado + vincula ID da ação gerada.
 * Idempotente: clique duplo retorna o mesmo acaoId. Transacional: se a
 * criação da ação falhar OU a atualização do email falhar, nada é gravado
 * (evita ação órfã que reaparece em refresh).
 */
export async function criarAcaoDeEmail(
  userId: string,
  aiId: string
): Promise<{ acaoId: string }> {
  return prisma.$transaction(async (tx) => {
    const email = await tx.painelEmailAI.findFirst({
      where: { id: aiId, userId },
    });
    if (!email) throw new Error("email AI nao encontrado");
    if (email.processado && email.acaoGeradaId) {
      return { acaoId: email.acaoGeradaId };
    }
    // Defesa em profundidade: a UI ja gateia, mas via API direta tipo=fyi/spam
    // criaria uma acao sem quadrante (orfa no painel).
    if (email.tipo === "fyi" || email.tipo === "spam") {
      throw new Error(
        `email tipo=${email.tipo} nao gera acao (apenas acao/agendamento/cliente_novo)`
      );
    }

    const acao = await tx.acaoPainel.create({
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

    await tx.painelEmailAI.update({
      where: { id: aiId },
      data: { processado: true, acaoGeradaId: acao.id },
    });

    return { acaoId: acao.id };
  });
}
