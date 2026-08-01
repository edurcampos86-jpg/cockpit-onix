"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { cpfValido } from "@/lib/backoffice/cpf";
import { isEmailCorporativo, listaDominiosCorporativos } from "@/lib/dominios-corporativos";
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

/**
 * Código do assessor no BTG: só dígitos, ou null.
 *
 * NULL e "" são a mesma coisa aqui — quem não atende no BTG deixa o campo em
 * branco, e string vazia numa coluna UNIQUE só pode existir uma vez no banco.
 * Zeros à esquerda caem porque a Base BTG exporta o código sem padding (16
 * assessores, de "64141" a "56890203"), ao contrário de numeroConta.
 */
function codigoAssessorOrNull(v: FormDataEntryValue | null): string | null {
  const d = digits(s(v));
  if (!d) return null;
  return d.replace(/^0+/, "") || null;
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
  // Tamanho não basta: o CPF é a chave de cruzamento com os relatórios do BTG,
  // e um dígito trocado tem 11 dígitos, entra como chave única e nunca casa —
  // sem sinal em tela nenhuma.
  if (!cpfValido(cpfRaw)) {
    return { ok: false, error: "CPF inválido — dígitos verificadores não conferem" };
  }
  if (!email.includes("@")) return { ok: false, error: "Email inválido" };
  // Pessoa.email é UNIQUE e é o vínculo com o login (Pessoa.userId → User):
  // é identidade, não contato. Conta pessoal não se revoga quando alguém sai e
  // não casa com o `E-mail Assessor` dos relatórios do BTG.
  if (!isEmailCorporativo(email)) {
    return {
      ok: false,
      error: `Use o e-mail corporativo (${listaDominiosCorporativos()}) — é ele que dá o acesso e é revogado na saída`,
    };
  }
  if (!isCargo(cargoFamilia)) return { ok: false, error: "Cargo (família) inválido" };
  if (!filialId) return { ok: false, error: "Filial obrigatória" };
  if (!departamentoId) return { ok: false, error: "Departamento obrigatório" };

  const teamRoleRaw = s(formData.get("teamRole")) || "colaborador";
  if (!isTeamRole(teamRoleRaw)) return { ok: false, error: "Nível de acesso inválido" };

  const cpf = digits(cpfRaw);
  const codigoAssessorBtg = codigoAssessorOrNull(formData.get("codigoAssessorBtg"));

  // Unicidade. O código do assessor entra no mesmo OR: é UNIQUE no banco e um
  // choque ali estouraria como erro cru do Prisma, sem dizer qual campo.
  const existing = await prisma.pessoa.findFirst({
    where: {
      OR: [{ cpf }, { email }, ...(codigoAssessorBtg ? [{ codigoAssessorBtg }] : [])],
    },
    select: { id: true, cpf: true, email: true, codigoAssessorBtg: true, nomeCompleto: true },
  });
  if (existing) {
    if (existing.cpf === cpf) return { ok: false, error: "Já existe pessoa com esse CPF" };
    if (codigoAssessorBtg && existing.codigoAssessorBtg === codigoAssessorBtg) {
      return {
        ok: false,
        error: `Código de assessor ${codigoAssessorBtg} já é de ${existing.nomeCompleto}`,
      };
    }
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
      codigoAssessorBtg,
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

  // Validação de dígitos só quando o CPF MUDA. Cadastro antigo que já esteja
  // no banco continua editável (dá para corrigir o telefone de alguém sem ter
  // de resolver o CPF antes); o que não passa é gravar um CPF novo inválido.
  const atual = await prisma.pessoa.findUnique({
    where: { id },
    select: { cpf: true, email: true },
  });
  if (!atual) return { ok: false, error: "Pessoa não encontrada" };
  if (cpf !== atual.cpf && !cpfValido(cpf)) {
    return { ok: false, error: "CPF inválido — dígitos verificadores não conferem" };
  }
  // Mesma regra do CPF: só barra e-mail pessoal quando ele MUDA. As 3 pessoas
  // que hoje têm conta pessoal seguem editáveis (dá para corrigir o telefone
  // de alguém sem ter de migrar o e-mail antes); o que não passa é trocar por
  // outro e-mail pessoal.
  if (email !== atual.email && !isEmailCorporativo(email)) {
    return {
      ok: false,
      error: `Use o e-mail corporativo (${listaDominiosCorporativos()}) — é ele que dá o acesso e é revogado na saída`,
    };
  }

  const codigoAssessorBtg = codigoAssessorOrNull(formData.get("codigoAssessorBtg"));

  // Unicidade ignorando o próprio. O código do assessor entra no mesmo OR:
  // é UNIQUE no banco e um choque ali estouraria como erro cru do Prisma, sem
  // dizer qual campo. Dois assessores nunca dividem código no BTG.
  const conflict = await prisma.pessoa.findFirst({
    where: {
      OR: [
        { cpf },
        { email },
        ...(codigoAssessorBtg ? [{ codigoAssessorBtg }] : []),
      ],
      NOT: { id },
    },
    select: { id: true, cpf: true, email: true, codigoAssessorBtg: true, nomeCompleto: true },
  });
  if (conflict) {
    if (conflict.cpf === cpf) return { ok: false, error: "Já existe pessoa com esse CPF" };
    if (codigoAssessorBtg && conflict.codigoAssessorBtg === codigoAssessorBtg) {
      return {
        ok: false,
        error: `Código de assessor ${codigoAssessorBtg} já é de ${conflict.nomeCompleto}`,
      };
    }
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
      codigoAssessorBtg,
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
