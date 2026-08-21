"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { normalizarTipoParceiro, ehTipoParceiroConhecido } from "@/lib/parceiros/vocabulario";
import { parceiroPorNome } from "@/lib/parceiros/consultas";

/* ──────────────────────────────────────────────────────────────
 * Escritas de Parceiro. Uma ação por decisão de negócio.
 *
 * `requireAdmin` em TODAS: parceiro carrega acordo de comissão, e quem cadastra
 * o parceiro é quem depois pendura o percentual nele. Mesma régua do
 * `actions/acordo-comercial.ts` (Pessoa), pelo mesmo motivo.
 * ────────────────────────────────────────────────────────────── */

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}
function dataOuNula(v: FormDataEntryValue | null): Date | null {
  const t = texto(v);
  if (!t) return null;
  // Data sem hora vira meio-dia UTC: meia-noite ISO cai no dia anterior em
  // qualquer fuso a oeste, e "assinado em 01/08" virando 31/07 não se percebe.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type ResultadoAcao =
  | { ok: true; parceiroId: string }
  | { ok: false; erro: string };

/**
 * Cria o parceiro. NÃO cria acordo nem vínculo — são decisões separadas, com
 * telas próprias, porque um parceiro pode existir por meses antes de o acordo
 * ser fechado.
 */
export async function criarParceiro(formData: FormData): Promise<ResultadoAcao> {
  const ctx = await requireAdmin();

  const nome = texto(formData.get("nome"));
  const tipoBruto = texto(formData.get("tipo"));
  const contratoAssinadoEm = dataOuNula(formData.get("contratoAssinadoEm"));

  if (nome.length < 2) {
    return { ok: false, erro: "Informe o nome do parceiro." };
  }
  if (nome.length > 120) {
    return { ok: false, erro: "Nome muito longo (máximo 120 caracteres)." };
  }

  const tipo = normalizarTipoParceiro(tipoBruto);
  if (!tipo) {
    return { ok: false, erro: "Escolha a relação do parceiro com a Onix." };
  }
  // Fora da lista é PERMITIDO — a taxonomia ainda assenta (ver vocabulario.ts).
  // O aviso fica para quem lê o registro depois, não bloqueia o cadastro.
  if (!ehTipoParceiroConhecido(tipo)) {
    console.info(`[parceiros] tipo fora da lista de referência: ${tipo}`);
  }

  // Nome repetido não é erro de banco (não há unique), e sim quase sempre erro
  // humano: o segundo "Renan" divide a carteira em duas e nenhuma das duas
  // fecha. Barrar aqui é mais barato que descobrir no fechamento.
  const jaExiste = await parceiroPorNome(nome);
  if (jaExiste) {
    return {
      ok: false,
      erro: `Já existe um parceiro chamado "${jaExiste.nome}". Abra a ficha dele em vez de criar outro.`,
    };
  }

  const criado = await prisma.parceiro.create({
    data: {
      nome,
      tipo,
      contratoAssinadoEm,
      criadoPor: ctx.userId,
    },
    select: { id: true },
  });

  revalidatePath("/time/parceiros");
  return { ok: true, parceiroId: criado.id };
}

/**
 * Versão para `<form action={...}>`: cria e leva para a ficha do parceiro.
 *
 * O erro volta pela querystring, e não por estado de cliente, para o formulário
 * seguir sendo um Server Component — sem `useState`, sem hidratação, e sem
 * chance de o Prisma atravessar para o browser.
 */
export async function criarParceiroForm(formData: FormData): Promise<void> {
  const r = await criarParceiro(formData);
  if (!r.ok) {
    const nome = texto(formData.get("nome"));
    redirect(
      `/time/parceiros/novo?erro=${encodeURIComponent(r.erro)}&nome=${encodeURIComponent(nome)}`,
    );
  }
  redirect(`/time/parceiros/${r.parceiroId}?novo=1`);
}

/** Marca o parceiro como inativo (ou reativa). Não apaga nada. */
export async function alternarAtivoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = texto(formData.get("parceiroId"));
  const ativar = texto(formData.get("ativar")) === "1";
  if (!id) return;

  // `updateMany` e não `update`: com `update`, id inexistente vira P2025 e
  // uma tela de erro do Next. Aqui vira zero linhas afetadas — a ação some,
  // que é o comportamento certo para um botão de uma página que alguém deixou
  // aberta enquanto o registro era removido em outra aba.
  await prisma.parceiro.updateMany({
    where: { id },
    data: { ativo: ativar, atualizadoPor: ctx.userId },
  });
  revalidatePath("/time/parceiros");
  revalidatePath(`/time/parceiros/${id}`);
}

/** Registra (ou limpa) a data de assinatura do contrato do parceiro. */
export async function salvarContratoForm(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const id = texto(formData.get("parceiroId"));
  if (!id) return;

  // Mesmo motivo do `alternarAtivoForm`: id inexistente não deve virar erro
  // 500 numa página que já estava aberta.
  await prisma.parceiro.updateMany({
    where: { id },
    data: {
      contratoAssinadoEm: dataOuNula(formData.get("contratoAssinadoEm")),
      atualizadoPor: ctx.userId,
    },
  });
  revalidatePath("/time/parceiros");
  revalidatePath(`/time/parceiros/${id}`);
}
