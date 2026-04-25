"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { createSession } from "@/lib/session";

const TOKEN_LIFETIME_DAYS = 7;
const TOKEN_BYTES = 32; // 64 hex chars

function s(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function gerarToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

/* ──────────────────────────────────────────────────────────────────────────
   gerarConvite — admin only.
   Cria ou substitui o convite da pessoa. Sempre invalida convite anterior.
   Retorna a URL pública pra admin copiar e mandar pro convidado.
   ────────────────────────────────────────────────────────────────────────── */

export async function gerarConvite(
  formData: FormData,
): Promise<{ ok: true; url: string; token: string } | { ok: false; error: string }> {
  await requireAdmin();

  const pessoaId = s(formData.get("pessoaId"));
  if (!pessoaId) return { ok: false, error: "ID da pessoa ausente" };

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: { id: true, userId: true, status: true },
  });
  if (!pessoa) return { ok: false, error: "Pessoa não encontrada" };
  if (pessoa.status === "arquivado") {
    return { ok: false, error: "Pessoa arquivada — não pode receber convite" };
  }
  if (pessoa.userId) {
    return {
      ok: false,
      error: "Pessoa já tem login ativo no Cockpit. Não precisa de convite.",
    };
  }

  const token = gerarToken();
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  // Upsert — se já existe convite (mesmo expirado/usado), substitui
  await prisma.conviteOnboarding.upsert({
    where: { pessoaId },
    update: {
      token,
      expiresAt,
      usedAt: null,
      criadoEm: new Date(),
    },
    create: {
      pessoaId,
      token,
      expiresAt,
    },
  });

  // Construir URL — base vem do request? Vamos usar variável de ambiente ou hardcode da prod
  // Em ambiente Server Action, não temos acesso direto ao host. Usamos uma env opcional.
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    ""; // sem base, retorna só o path
  const url = base
    ? `${base.replace(/\/$/, "")}/onboarding/${token}`
    : `/onboarding/${token}`;

  revalidatePath(`/time/${pessoaId}`);
  return { ok: true, url, token };
}

/* ──────────────────────────────────────────────────────────────────────────
   revogarConvite — admin only.
   ────────────────────────────────────────────────────────────────────────── */

export async function revogarConvite(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const pessoaId = s(formData.get("pessoaId"));
  if (!pessoaId) return { ok: false, error: "ID ausente" };

  await prisma.conviteOnboarding.deleteMany({ where: { pessoaId } });
  revalidatePath(`/time/${pessoaId}`);
  return { ok: true };
}

/* ──────────────────────────────────────────────────────────────────────────
   concluirOnboarding — PÚBLICO (sem auth).
   Recebe token + senha. Valida, cria User, vincula a Pessoa, faz login.
   ────────────────────────────────────────────────────────────────────────── */

export async function concluirOnboarding(formData: FormData): Promise<void> {
  const token = s(formData.get("token"));
  const senha = s(formData.get("senha"));
  const senhaConfirm = s(formData.get("senhaConfirm"));

  if (!token) throw new Error("Token ausente");
  if (senha.length < 8) throw new Error("Senha deve ter pelo menos 8 caracteres");
  if (senha !== senhaConfirm) throw new Error("Senhas não coincidem");

  const convite = await prisma.conviteOnboarding.findUnique({
    where: { token },
    include: {
      pessoa: {
        select: { id: true, nomeCompleto: true, cpf: true, email: true, userId: true },
      },
    },
  });

  if (!convite) throw new Error("Convite não encontrado ou inválido");
  if (convite.usedAt) throw new Error("Convite já foi usado");
  if (convite.expiresAt < new Date()) throw new Error("Convite expirado");
  if (convite.pessoa.userId) {
    throw new Error("Pessoa já tem login. Convite obsoleto.");
  }

  // Garantir que CPF/email não conflitam com User existente
  const existingUser = await prisma.user.findFirst({
    where: { OR: [{ cpf: convite.pessoa.cpf }, { email: convite.pessoa.email }] },
    select: { id: true },
  });
  if (existingUser) {
    throw new Error("Já existe usuário com esse CPF ou email no sistema");
  }

  const passwordHash = bcrypt.hashSync(senha, 10);

  // Cria User + vincula a Pessoa + marca convite como usado, em transação
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: convite.pessoa.nomeCompleto,
        cpf: convite.pessoa.cpf,
        email: convite.pessoa.email,
        password: passwordHash,
        role: "support", // padrão pra membros do time; admin é gerenciado separado
      },
    });
    await tx.pessoa.update({
      where: { id: convite.pessoa.id },
      data: { userId: u.id },
    });
    await tx.conviteOnboarding.update({
      where: { id: convite.id },
      data: { usedAt: new Date() },
    });
    return u;
  });

  // Cria sessão e redireciona pra ficha da pessoa
  await createSession(user.id, user.name, user.role);
  redirect(`/time/${convite.pessoa.id}`);
}

/* ──────────────────────────────────────────────────────────────────────────
   Wrappers void
   ────────────────────────────────────────────────────────────────────────── */

export async function gerarConviteForm(formData: FormData): Promise<void> {
  const r = await gerarConvite(formData);
  if (!r.ok) throw new Error(r.error);
  // O resultado (URL) é mostrado via re-render do server component que lê do DB.
}

export async function revogarConviteForm(formData: FormData): Promise<void> {
  const r = await revogarConvite(formData);
  if (!r.ok) throw new Error(r.error);
}
