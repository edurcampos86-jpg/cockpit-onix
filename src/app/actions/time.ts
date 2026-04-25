"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  CARGO_FAMILIAS,
  TEAM_ROLES,
  MOTIVOS_SAIDA,
  type CargoFamiliaValue,
  type TeamRoleValue,
  type MotivoSaidaValue,
} from "@/lib/team";

/* ──────────────────────────────────────────────────────────────────────────
   Utilitários internos
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

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

function isCargo(v: string): v is CargoFamiliaValue {
  return CARGO_FAMILIAS.some((c) => c.value === v);
}
function isTeamRole(v: string): v is TeamRoleValue {
  return TEAM_ROLES.some((c) => c.value === v);
}
function isMotivo(v: string): v is MotivoSaidaValue {
  return MOTIVOS_SAIDA.some((c) => c.value === v);
}

export type TimeActionResult =
  | { ok: true; pessoaId: string }
  | { ok: false; error: string };

/* ──────────────────────────────────────────────────────────────────────────
   createPessoa — admin only
   ────────────────────────────────────────────────────────────────────────── */

export async function createPessoa(formData: FormData): Promise<TimeActionResult> {
  await requireAdmin();

  const nomeCompleto = s(formData.get("nomeCompleto"));
  const cpfRaw = s(formData.get("cpf"));
  const email = s(formData.get("email")).toLowerCase();
  const cargoFamilia = s(formData.get("cargoFamilia"));
  const filialId = s(formData.get("filialId"));
  const departamentoId = s(formData.get("departamentoId"));

  if (!nomeCompleto) return { ok: false, error: "Nome completo é obrigatório" };
  if (digits(cpfRaw).length !== 11) return { ok: false, error: "CPF inválido (11 dígitos)" };
  if (!email.includes("@")) return { ok: false, error: "Email inválido" };
  if (!isCargo(cargoFamilia)) return { ok: false, error: "Cargo (família) inválido" };
  if (!filialId) return { ok: false, error: "Filial obrigatória" };
  if (!departamentoId) return { ok: false, error: "Departamento obrigatório" };

  const teamRoleRaw = s(formData.get("teamRole")) || "colaborador";
  if (!isTeamRole(teamRoleRaw)) return { ok: false, error: "Nível de acesso inválido" };

  const cpf = digits(cpfRaw);

  // Unicidade
  const existing = await prisma.pessoa.findFirst({
    where: { OR: [{ cpf }, { email }] },
    select: { id: true, cpf: true, email: true },
  });
  if (existing) {
    if (existing.cpf === cpf) return { ok: false, error: "Já existe pessoa com esse CPF" };
    return { ok: false, error: "Já existe pessoa com esse email" };
  }

  const created = await prisma.pessoa.create({
    data: {
      nomeCompleto,
      apelido: sOrNull(formData.get("apelido")),
      cpf,
      email,
      telefone: sOrNull(formData.get("telefone")),
      dataNascimento: dateOrNull(formData.get("dataNascimento")),
      cidade: sOrNull(formData.get("cidade")),
      dataEntrada: dateOrNull(formData.get("dataEntrada")) ?? new Date(),
      cargoFamilia,
      cargoTitulo: sOrNull(formData.get("cargoTitulo")),
      teamRole: teamRoleRaw,
      filialId,
      departamentoId,
      equipeId: sOrNull(formData.get("equipeId")),
      lideradoPorId: sOrNull(formData.get("lideradoPorId")),
      observacoes: sOrNull(formData.get("observacoes")),
    },
  });

  revalidatePath("/time");
  return { ok: true, pessoaId: created.id };
}

/** Wrapper para uso direto em <form action={...}> com redirect na sucesso. */
export async function createPessoaAndRedirect(formData: FormData): Promise<void> {
  const result = await createPessoa(formData);
  if (result.ok) {
    redirect(`/time/${result.pessoaId}`);
  }
  // Em caso de erro, lançar para o boundary tratar — em iteração futura,
  // trocaremos por useFormState para mensagens inline.
  throw new Error(result.error);
}

/* ──────────────────────────────────────────────────────────────────────────
   updatePessoa — admin only
   ────────────────────────────────────────────────────────────────────────── */

export async function updatePessoa(formData: FormData): Promise<TimeActionResult> {
  await requireAdmin();

  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  const nomeCompleto = s(formData.get("nomeCompleto"));
  const cpfRaw = s(formData.get("cpf"));
  const email = s(formData.get("email")).toLowerCase();
  const cargoFamilia = s(formData.get("cargoFamilia"));
  const filialId = s(formData.get("filialId"));
  const departamentoId = s(formData.get("departamentoId"));
  const teamRoleRaw = s(formData.get("teamRole")) || "colaborador";

  if (!nomeCompleto) return { ok: false, error: "Nome completo é obrigatório" };
  if (digits(cpfRaw).length !== 11) return { ok: false, error: "CPF inválido (11 dígitos)" };
  if (!email.includes("@")) return { ok: false, error: "Email inválido" };
  if (!isCargo(cargoFamilia)) return { ok: false, error: "Cargo (família) inválido" };
  if (!isTeamRole(teamRoleRaw)) return { ok: false, error: "Nível de acesso inválido" };
  if (!filialId) return { ok: false, error: "Filial obrigatória" };
  if (!departamentoId) return { ok: false, error: "Departamento obrigatório" };

  const cpf = digits(cpfRaw);

  // Unicidade ignorando o próprio
  const conflict = await prisma.pessoa.findFirst({
    where: {
      OR: [{ cpf }, { email }],
      NOT: { id },
    },
    select: { id: true, cpf: true, email: true },
  });
  if (conflict) {
    if (conflict.cpf === cpf) return { ok: false, error: "Já existe pessoa com esse CPF" };
    return { ok: false, error: "Já existe pessoa com esse email" };
  }

  await prisma.pessoa.update({
    where: { id },
    data: {
      nomeCompleto,
      apelido: sOrNull(formData.get("apelido")),
      cpf,
      email,
      telefone: sOrNull(formData.get("telefone")),
      dataNascimento: dateOrNull(formData.get("dataNascimento")),
      cidade: sOrNull(formData.get("cidade")),
      dataEntrada: dateOrNull(formData.get("dataEntrada")) ?? new Date(),
      cargoFamilia,
      cargoTitulo: sOrNull(formData.get("cargoTitulo")),
      teamRole: teamRoleRaw,
      filialId,
      departamentoId,
      equipeId: sOrNull(formData.get("equipeId")),
      lideradoPorId: sOrNull(formData.get("lideradoPorId")),
      observacoes: sOrNull(formData.get("observacoes")),
    },
  });

  revalidatePath("/time");
  revalidatePath(`/time/${id}`);
  return { ok: true, pessoaId: id };
}

export async function updatePessoaAndRedirect(formData: FormData): Promise<void> {
  const result = await updatePessoa(formData);
  if (result.ok) redirect(`/time/${result.pessoaId}`);
  throw new Error(result.error);
}

/* ──────────────────────────────────────────────────────────────────────────
   archivePessoa / restorePessoa — admin only
   ────────────────────────────────────────────────────────────────────────── */

export async function archivePessoa(formData: FormData): Promise<TimeActionResult> {
  await requireAdmin();

  const id = s(formData.get("id"));
  const motivoRaw = s(formData.get("motivoSaida"));
  const dataSaida = dateOrNull(formData.get("dataSaida")) ?? new Date();

  if (!id) return { ok: false, error: "ID ausente" };
  if (!isMotivo(motivoRaw)) return { ok: false, error: "Motivo de saída inválido" };

  await prisma.pessoa.update({
    where: { id },
    data: {
      status: "arquivado",
      dataSaida,
      motivoSaida: motivoRaw,
    },
  });

  revalidatePath("/time");
  revalidatePath(`/time/${id}`);
  return { ok: true, pessoaId: id };
}

export async function restorePessoa(formData: FormData): Promise<TimeActionResult> {
  await requireAdmin();
  const id = s(formData.get("id"));
  if (!id) return { ok: false, error: "ID ausente" };

  await prisma.pessoa.update({
    where: { id },
    data: { status: "ativo", dataSaida: null, motivoSaida: null },
  });

  revalidatePath("/time");
  revalidatePath(`/time/${id}`);
  return { ok: true, pessoaId: id };
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void para uso direto em <form action={...}>.
   Next 16 exige action: (FormData) => void | Promise<void>.
   ────────────────────────────────────────────────────────────────────────── */

export async function archivePessoaForm(formData: FormData): Promise<void> {
  const r = await archivePessoa(formData);
  if (!r.ok) throw new Error(r.error);
}

export async function restorePessoaForm(formData: FormData): Promise<void> {
  const r = await restorePessoa(formData);
  if (!r.ok) throw new Error(r.error);
}
