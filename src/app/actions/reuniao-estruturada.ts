"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { getConfig } from "@/lib/config-db";
import { gravarFatosPatrimonio } from "@/lib/cockpit-reuniao/fatos-patrimonio";
import {
  CADENCIAS_REUNIAO,
  type ItemAcionavel,
  type PatrimonioSnapshot,
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

/* ──────────────────────────────────────────────────────────────────────────
   Import via IA (Plaud) — action-irmã que recebe OBJETO já extraído/editado no
   preview, em vez de FormData. NÃO altera `criarReuniaoEstruturada` (o fluxo
   manual segue intacto). Persiste também `textoBruto` e `patrimonioSnapshot`.
   ────────────────────────────────────────────────────────────────────────── */

export type ImportarReuniaoInput = {
  clienteId: string;
  pessoaId?: string | null;
  data: string | null; // ISO yyyy-mm-dd (ou null se a IA não achou)
  dataRetorno?: string | null; // ISO yyyy-mm-dd — próxima data de retorno (opcional)
  tipoCadencia?: string | null;
  pautas: string[];
  pendenciasAssessor: string[];
  pendenciasCliente: string[];
  proximosPassos: string[];
  textoBruto?: string | null;
  patrimonioSnapshot?: Partial<PatrimonioSnapshot> | null;
  // Metadados do histórico de import (registrados em ReuniaoImport).
  fonte?: "texto" | "pdf";
  nomeArquivo?: string | null; // nome do PDF, quando fonte=pdf
  b2Key?: string | null; // key do PDF no B2 (null se sem storage)
  contentType?: string | null;
  tamanhoBytes?: number | null;
};

/** Mantém só strings não-vazias (trim) de uma lista possivelmente suja. */
function limparLista(v: string[] | undefined | null): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((t) => (typeof t === "string" ? t.trim() : "")).filter(Boolean);
}

/** Número finito ou undefined (descarta NaN/Infinity/lixo). */
function numFinito(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Normaliza o snapshot de patrimônio. Devolve `null` quando não há NENHUM dado
 * útil (todos os totais vazios e sem observação) — evita gravar `{ moeda }` solto.
 */
function normalizarPatrimonio(
  p: Partial<PatrimonioSnapshot> | null | undefined,
): PatrimonioSnapshot | null {
  if (!p || typeof p !== "object") return null;
  const totalBtg = numFinito(p.totalBtg);
  const totalForaBtg = numFinito(p.totalForaBtg);
  const totalGeral = numFinito(p.totalGeral);
  const observacao =
    typeof p.observacao === "string" && p.observacao.trim()
      ? p.observacao.trim()
      : undefined;
  if (
    totalBtg === undefined &&
    totalForaBtg === undefined &&
    totalGeral === undefined &&
    !observacao
  ) {
    return null;
  }
  return {
    moeda: "BRL",
    ...(totalBtg !== undefined ? { totalBtg } : {}),
    ...(totalForaBtg !== undefined ? { totalForaBtg } : {}),
    ...(totalGeral !== undefined ? { totalGeral } : {}),
    ...(observacao ? { observacao } : {}),
  };
}

/**
 * Cria uma `ReuniaoEstruturada` a partir do preview do import via IA.
 * Mesmas validações de FK e mesmo shape de conteúdo de `criarReuniaoEstruturada`,
 * só que recebendo um objeto. Cadência fora do whitelist é descartada (null).
 */
export async function importarReuniaoEstruturada(
  input: ImportarReuniaoInput,
): Promise<CriarReuniaoState> {
  const ctx = await getAuthContext();

  const clienteId = typeof input.clienteId === "string" ? input.clienteId.trim() : "";
  if (!clienteId) return { ok: false, error: "Cliente não informado." };

  const data = dateOrNull(input.data ?? null);
  if (!data) return { ok: false, error: "Informe a data da reunião." };

  // Próxima data de retorno (opcional) — mesma coerção do campo data; null se ausente.
  const dataRetorno = dateOrNull(input.dataRetorno ?? null);

  const tipoCadenciaRaw =
    typeof input.tipoCadencia === "string" ? input.tipoCadencia.trim() : "";
  const tipoCadencia =
    tipoCadenciaRaw && isCadencia(tipoCadenciaRaw) ? tipoCadenciaRaw : null;

  const pessoaId =
    typeof input.pessoaId === "string" && input.pessoaId.trim()
      ? input.pessoaId.trim()
      : null;

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

  const pautas: ReuniaoPautas = limparLista(input.pautas).map((texto) => ({ texto }));
  const pendencias: ReuniaoPendencias = {
    assessor: limparLista(input.pendenciasAssessor).map(novoItemAcionavel),
    cliente: limparLista(input.pendenciasCliente).map(novoItemAcionavel),
  };
  const proximosPassos: ReuniaoProximosPassos =
    limparLista(input.proximosPassos).map(novoItemAcionavel);

  const textoBruto =
    typeof input.textoBruto === "string" && input.textoBruto.trim()
      ? input.textoBruto
      : null;
  const patrimonioSnapshot = normalizarPatrimonio(input.patrimonioSnapshot);

  const fonte = input.fonte === "pdf" ? "pdf" : "texto";
  const tamanhoBytes =
    typeof input.tamanhoBytes === "number" && Number.isFinite(input.tamanhoBytes)
      ? Math.max(0, Math.trunc(input.tamanhoBytes))
      : null;

  // Gate da escrita de fatos de perfil (Fase 1a). Default OFF. Lido ANTES da
  // transação; idioma idêntico aos schedulers in-process. OFF => comportamento
  // idêntico a hoje (zero fato escrito).
  const f = (await getConfig("PERFIL_FATO_WRITE"))?.trim().toLowerCase();
  const ligadoFatos = f === "on" || f === "true" || f === "1";

  // Reunião + registro de histórico atômicos: se um falha, nada grava.
  await prisma.$transaction(async (tx) => {
    const reuniao = await tx.reuniaoEstruturada.create({
      data: {
        clienteId,
        data,
        dataRetorno,
        tipoCadencia,
        pessoaId,
        pautas,
        pendencias,
        proximosPassos,
        textoBruto,
        patrimonioSnapshot: patrimonioSnapshot ?? undefined,
      },
      select: { id: true },
    });

    // Fatos de patrimônio (Fase 1a) — no MESMO tx (atômico com a reunião).
    // Flag OFF ou sem patrimônio => no-op. Grava só os totais que mudaram.
    if (ligadoFatos && patrimonioSnapshot) {
      await gravarFatosPatrimonio(tx, {
        clienteId,
        reuniaoId: reuniao.id,
        patrimonio: patrimonioSnapshot,
      });
    }

    await tx.reuniaoImport.create({
      data: {
        clienteId,
        reuniaoEstruturadaId: reuniao.id,
        fonte,
        textoBruto,
        nomeArquivo: input.nomeArquivo?.trim() || null,
        b2Key: input.b2Key?.trim() || null,
        contentType: input.contentType?.trim() || null,
        tamanhoBytes,
        importadoPor: ctx.userId,
      },
    });
  });

  revalidatePath(`/empresas/investimentos/clientes/${clienteId}`);
  return { ok: true };
}
