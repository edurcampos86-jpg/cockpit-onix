import "server-only";
import { prisma } from "@/lib/prisma";
import { toE164, phoneDigits, brazilianPhoneVariants } from "@/lib/phone";

/**
 * Funções compartilhadas pra resolver `clienteId` em ClienteBackoffice a
 * partir de identificadores externos (telefone, e-mail).
 *
 * NOTA: existe lógica equivalente em `datacrazy-ingest.ts` (private).
 * Esta versão é mais geral, exportada — usada pelos novos syncs (Datacrazy
 * Atividades, futuras integrações). O ingest de conversas continua usando
 * a versão interna pra não mexer em prod que já funciona.
 *
 * Princípio (memória do Eduardo):
 *   Matching de cliente em automações — nunca só por nome.
 *   Exigir telefone, e-mail, ou fonte cruzada antes de gravar na ficha.
 */

/**
 * Tenta resolver clienteId pelo telefone normalizado.
 * Estratégia em 3 passos, do mais firme pro mais tolerante:
 *   1. Match exato em E.164
 *   2. Variantes BR com/sem "9" inicial (WhatsApp pré-2014 vs novo)
 *   3. Últimos 8 dígitos (cobre cadastros sem DDI ou DDD divergente)
 */
export async function resolverClienteIdPorTelefone(
  rawPhone: string | null | undefined,
): Promise<string | null> {
  const e164 = toE164(rawPhone);
  if (e164) {
    const exato = await prisma.clienteBackoffice.findFirst({
      where: { telefone: e164 },
      select: { id: true },
    });
    if (exato) return exato.id;

    const variantes = brazilianPhoneVariants(e164).filter((v) => v !== e164);
    if (variantes.length > 0) {
      const comVariante = await prisma.clienteBackoffice.findFirst({
        where: { telefone: { in: variantes } },
        select: { id: true },
      });
      if (comVariante) return comVariante.id;
    }
  }

  const digits = phoneDigits(rawPhone);
  if (digits.length >= 10) {
    const ultimos8 = digits.slice(-8);
    const candidato = await prisma.clienteBackoffice.findFirst({
      where: { telefone: { endsWith: ultimos8 } },
      select: { id: true },
    });
    if (candidato) return candidato.id;
  }

  return null;
}

/**
 * Resolve clienteId por e-mail exato (case-insensitive, trim).
 */
export async function resolverClienteIdPorEmail(
  rawEmail: string | null | undefined,
): Promise<string | null> {
  const email = (rawEmail ?? "").toLowerCase().trim();
  if (!email) return null;
  const cliente = await prisma.clienteBackoffice.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  return cliente?.id ?? null;
}

export type ClienteMatchVia = "telefone" | "email";

/**
 * Tenta resolver clienteId por telefone OU e-mail.
 * Retorna o primeiro match com a via que casou — útil pra auditoria.
 *
 * Ordem: telefone primeiro (mais confiável, único na base BTG),
 *        depois e-mail.
 */
export async function resolverClienteId(args: {
  telefone?: string | null;
  email?: string | null;
}): Promise<{ clienteId: string; via: ClienteMatchVia } | null> {
  if (args.telefone) {
    const id = await resolverClienteIdPorTelefone(args.telefone);
    if (id) return { clienteId: id, via: "telefone" };
  }
  if (args.email) {
    const id = await resolverClienteIdPorEmail(args.email);
    if (id) return { clienteId: id, via: "email" };
  }
  return null;
}
