"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import {
  CADENCIAS_REUNIAO,
  type ItemAcionavel,
  type ReuniaoPautas,
  type ReuniaoPendencias,
  type ReuniaoProximosPassos,
} from "@/lib/cockpit-reuniao/tipos";

/* ──────────────────────────────────────────────────────────────────────────
   Helpers de coerção — mesmo padrão de reuniao-time.ts (sem Zod; o repo não usa).
   ────────────────────────────────────────────────────────────────────────── */

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function sOrNull(v: FormDataEntryValue | null): string | null {
  const t = s(v);
  return t.length === 0 ? null : t;
}
function dateOrNull(v: FormDataEntryValue | null): Date | null {
  const t = s(v);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isCadencia(v: string): boolean {
  return CADENCIAS_REUNIAO.some((c) => c.value === v);
}

/**
 * Lê um campo do FormData que chega como JSON string (lista de textos OU lista
 * de `{ texto }`) e devolve apenas os textos não-vazios. Tolerante a lixo: JSON
 * inválido ou shape inesperado vira lista vazia (nunca lança).
 */
function parseTextos(v: FormDataEntryValue | null): string[] {
  const raw = s(v);
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  for (const item of parsed) {
    let texto = "";
    if (typeof item === "string") {
      texto = item;
    } else if (item && typeof item === "object" && "texto" in item) {
      const t = (item as { texto: unknown }).texto;
      texto = typeof t === "string" ? t : "";
    }
    const limpo = texto.trim();
    if (limpo) out.push(limpo);
  }
  return out;
}

function novoItemAcionavel(texto: string): ItemAcionavel {
  return { texto, concluido: false, concluidoEm: null };
}

export type CriarReuniaoState = { ok: boolean; error?: string };

/**
 * Cria uma `ReuniaoEstruturada` a partir do formulário de captura manual.
 * Assinatura compatível com `useActionState` (prevState, formData).
 *
 * Obrigatórios: clienteId, data. Opcionais: tipoCadencia (whitelist), pessoaId
 * (quem conduziu), e as 4 listas (pautas, pendências do assessor/cliente,
 * próximos passos), que chegam serializadas como JSON string. Pendências e
 * próximos passos nascem com `concluido=false` / `concluidoEm=null` — o form só
 * coleta os textos.
 */
export async function criarReuniaoEstruturada(
  _prev: CriarReuniaoState,
  formData: FormData,
): Promise<CriarReuniaoState> {
  await getAuthContext();

  const clienteId = s(formData.get("clienteId"));
  if (!clienteId) return { ok: false, error: "Cliente não informado." };

  const data = dateOrNull(formData.get("data"));
  if (!data) return { ok: false, error: "Informe a data da reunião." };

  const tipoCadencia = sOrNull(formData.get("tipoCadencia"));
  if (tipoCadencia && !isCadencia(tipoCadencia)) {
    return { ok: false, error: "Cadência inválida." };
  }

  const pessoaId = sOrNull(formData.get("pessoaId"));

  // Cliente precisa existir (FK Cascade). Pessoa condutora, se informada, idem.
  const cliente = await prisma.clienteBackoffice.findUnique({
    where: { id: clienteId },
    select: { id: true },
  });
  if (!cliente) return { ok: false, error: "Cliente não encontrado." };

  if (pessoaId) {
    const pessoa = await prisma.pessoa.findUnique({
      where: { id: pessoaId },
      select: { id: true },
    });
    if (!pessoa) return { ok: false, error: "Pessoa (quem conduziu) não encontrada." };
  }

  const pautas: ReuniaoPautas = parseTextos(formData.get("pautas")).map((texto) => ({
    texto,
  }));
  const pendencias: ReuniaoPendencias = {
    assessor: parseTextos(formData.get("pendenciasAssessor")).map(novoItemAcionavel),
    cliente: parseTextos(formData.get("pendenciasCliente")).map(novoItemAcionavel),
  };
  const proximosPassos: ReuniaoProximosPassos = parseTextos(
    formData.get("proximosPassos"),
  ).map(novoItemAcionavel);

  await prisma.reuniaoEstruturada.create({
    data: {
      clienteId,
      data,
      tipoCadencia,
      pessoaId,
      pautas,
      pendencias,
      proximosPassos,
    },
  });

  revalidatePath(`/empresas/investimentos/clientes/${clienteId}`);
  return { ok: true };
}
