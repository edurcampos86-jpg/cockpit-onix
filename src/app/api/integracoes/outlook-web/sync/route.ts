import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/rbac-papeis";
import {
  upsertReuniao,
  recomputeAgregadosBatch,
  type ReuniaoMatchedVia,
} from "@/lib/reunioes";
import {
  buildClienteIndex,
  matchEventToClientes,
} from "@/lib/integrations/google-calendar-match";

export const dynamic = "force-dynamic";

/**
 * POST /api/integracoes/outlook-web/sync
 *
 * Recebe eventos extraídos manualmente do Outlook Web por um agente
 * autenticado como o próprio usuário, e grava cada match em ReuniaoCliente
 * com source "outlook-web".
 *
 * Existe porque o feed .ics (source "outlook-ics") não cobre tudo: é a via
 * de resgate quando a agenda precisa entrar e o feed não a traz.
 *
 * Reaproveita o matching do Google (buildClienteIndex/matchEventToClientes,
 * lógica pura em google-calendar-match.ts) — mesma escala de score, mesmo
 * comportamento de e-mail-primeiro-nome-depois. Não há lógica de match nova
 * aqui: fonte diferente, mesmo critério.
 *
 * Só admin, e sempre dentro da sessão logada — nunca com token solto. O
 * `userId` da reunião é o da própria sessão, o que escopa as linhas ao dono
 * da agenda de onde os eventos vieram.
 *
 * Body:
 *   {
 *     eventos: [{
 *       titulo: string,
 *       inicio: string,              // ISO 8601
 *       fim?: string | null,         // ISO 8601
 *       emailsParticipantes?: string[],
 *       emailOrganizador?: string | null
 *     }]
 *   }
 *
 * Resposta:
 *   { eventosRecebidos, matches, upserts, clientesRecomputados }
 *
 * Idempotente: rodar o mesmo payload duas vezes não duplica linha nem conta
 * upsert na segunda — `upsertReuniao` devolve "noop" quando nada mudou, e o
 * externalId é derivado do conteúdo do evento (ver externalIdDe).
 */

type EventoEntrada = {
  titulo?: unknown;
  inicio?: unknown;
  fim?: unknown;
  emailsParticipantes?: unknown;
  emailOrganizador?: unknown;
};

type EventoValido = {
  titulo: string;
  inicio: Date;
  fim: Date | null;
  emailsParticipantes: string[];
  emailOrganizador: string | null;
};

/**
 * externalId determinístico.
 *
 * O Outlook Web não expõe o id do evento de forma estável na extração, então
 * a identidade é derivada do conteúdo: título + início + organizador. Duas
 * execuções do mesmo dia produzem o mesmo id e caem no upsert em vez de
 * inserir linha nova.
 *
 * Início entra como epoch em ms (não a string crua) para que "2026-01-01T10:00Z"
 * e "2026-01-01T07:00-03:00" — o mesmo instante escrito de dois jeitos — não
 * gerem ids diferentes.
 */
export function externalIdDe(
  titulo: string,
  inicio: Date,
  organizador: string | null,
): string {
  const material = [
    titulo.trim().toLowerCase(),
    String(inicio.getTime()),
    (organizador ?? "").trim().toLowerCase(),
  ].join("|");
  return `ow_${createHash("sha256").update(material).digest("hex").slice(0, 32)}`;
}

function emailsDe(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter((e): e is string => typeof e === "string")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

function normalizarEvento(bruto: EventoEntrada, i: number): EventoValido | string {
  if (typeof bruto?.titulo !== "string" || !bruto.titulo.trim()) {
    return `eventos[${i}]: titulo ausente ou vazio`;
  }
  if (typeof bruto.inicio !== "string") {
    return `eventos[${i}]: inicio ausente`;
  }
  const inicio = new Date(bruto.inicio);
  if (Number.isNaN(inicio.getTime())) {
    return `eventos[${i}]: inicio não é data ISO válida ("${bruto.inicio}")`;
  }

  let fim: Date | null = null;
  if (typeof bruto.fim === "string" && bruto.fim.trim()) {
    const d = new Date(bruto.fim);
    if (Number.isNaN(d.getTime())) {
      return `eventos[${i}]: fim não é data ISO válida ("${bruto.fim}")`;
    }
    fim = d;
  }

  const organizador =
    typeof bruto.emailOrganizador === "string" &&
    bruto.emailOrganizador.includes("@")
      ? bruto.emailOrganizador.trim().toLowerCase()
      : null;

  return {
    titulo: bruto.titulo.trim(),
    inicio,
    fim,
    emailsParticipantes: emailsDe(bruto.emailsParticipantes),
    emailOrganizador: organizador,
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  if (!isAdmin({ role: session.role, pessoa: null })) {
    return NextResponse.json({ error: "Apenas admin" }, { status: 403 });
  }

  let body: { eventos?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body não é JSON válido" }, { status: 400 });
  }

  if (!Array.isArray(body?.eventos)) {
    return NextResponse.json(
      { error: "Body precisa de `eventos` como array" },
      { status: 400 },
    );
  }

  const eventos: EventoValido[] = [];
  const erros: string[] = [];
  for (const [i, bruto] of (body.eventos as EventoEntrada[]).entries()) {
    const r = normalizarEvento(bruto, i);
    if (typeof r === "string") erros.push(r);
    else eventos.push(r);
  }

  // Payload inteiro inválido é erro do chamador, não sync vazio silencioso.
  if (eventos.length === 0 && erros.length > 0) {
    return NextResponse.json(
      { error: "Nenhum evento válido no payload", detalhes: erros },
      { status: 400 },
    );
  }

  const clientes = await prisma.clienteBackoffice.findMany({
    select: {
      id: true,
      nome: true,
      nomeCompleto: true,
      apelido: true,
      email: true,
    },
  });
  const index = buildClienteIndex(clientes);

  const clientesAfetados = new Set<string>();
  let matches = 0;
  let upserts = 0;
  const porVia: Record<string, number> = {};

  for (const ev of eventos) {
    const externalId = externalIdDe(ev.titulo, ev.inicio, ev.emailOrganizador);

    const casados = matchEventToClientes(
      {
        attendees: ev.emailsParticipantes,
        organizer: ev.emailOrganizador,
        summary: ev.titulo,
      },
      index,
    );

    for (const m of casados) {
      matches++;
      porVia[m.via] = (porVia[m.via] ?? 0) + 1;
      try {
        const r = await upsertReuniao({
          clienteId: m.clienteId,
          userId: session.userId,
          source: "outlook-web",
          externalId,
          startAt: ev.inicio,
          endAt: ev.fim,
          titulo: ev.titulo,
          matchedVia: m.via as ReuniaoMatchedVia,
          rawPayload: {
            titulo: ev.titulo,
            inicio: ev.inicio.toISOString(),
            fim: ev.fim?.toISOString() ?? null,
            emailsParticipantes: ev.emailsParticipantes,
            emailOrganizador: ev.emailOrganizador,
          },
        });
        // "noop" não conta: é o que torna a 2ª execução do mesmo payload
        // observavelmente vazia em vez de parecer trabalho novo.
        if (r !== "noop") {
          upserts++;
          clientesAfetados.add(m.clienteId);
        }
      } catch (e) {
        erros.push(
          `upsert ${m.clienteId}/${externalId}: ${e instanceof Error ? e.message : "?"}`,
        );
      }
    }
  }

  // Só recomputa quem de fato mudou — na 2ª execução idêntica, ninguém.
  const { atualizados } = await recomputeAgregadosBatch([...clientesAfetados]);

  return NextResponse.json({
    eventosRecebidos: eventos.length,
    matches,
    upserts,
    clientesRecomputados: atualizados,
    ...(Object.keys(porVia).length > 0 ? { porVia } : {}),
    ...(erros.length > 0 ? { erros } : {}),
  });
}
