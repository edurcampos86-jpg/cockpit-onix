"use server";

import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
} | undefined;

// Remove formatting from CPF (dots and dashes)
function cleanCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export async function login(state: LoginState, formData: FormData): Promise<LoginState> {
  const rawCpf = formData.get("cpf") as string;
  const password = formData.get("password") as string;

  if (!rawCpf || !password) {
    return { error: "Preencha todos os campos." };
  }

  const cpf = cleanCpf(rawCpf);

  if (cpf.length !== 11) {
    return { error: "CPF inválido. Digite os 11 dígitos." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { cpf },
    });

    if (!user) {
      return { error: "CPF ou senha incorretos." };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return { error: "CPF ou senha incorretos." };
    }

    await createSession(user.id, user.name, user.role);
  } catch (error) {
    console.error("Login error:", error);
    return { error: "Erro ao fazer login. Tente novamente." };
  }

  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export type ResetPasswordState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | undefined;

export async function resetPassword(
  state: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const rawCpf = formData.get("cpf") as string;
  const secret = (formData.get("secret") as string) || "";
  const novaSenha = formData.get("novaSenha") as string;
  const confirmar = formData.get("confirmar") as string;

  if (!rawCpf || !novaSenha || !confirmar) {
    return { ok: false, error: "Preencha todos os campos." };
  }
  if (novaSenha !== confirmar) {
    return { ok: false, error: "As senhas não coincidem." };
  }
  if (novaSenha.length < 6) {
    return { ok: false, error: "Senha deve ter pelo menos 6 caracteres." };
  }

  const cpf = cleanCpf(rawCpf);
  if (cpf.length !== 11) {
    return { ok: false, error: "CPF inválido." };
  }

  // Bootstrap mode: se ainda não há nenhum admin no sistema, permite reset sem secret
  // (caso típico: primeira instalação, ou banco recriado). Quando já existe um admin,
  // exige PASSWORD_RESET_SECRET pra evitar que qualquer um resete senha de qualquer admin.
  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  const isBootstrap = adminCount === 0;
  if (!isBootstrap) {
    const expectedSecret = process.env.PASSWORD_RESET_SECRET;
    if (!expectedSecret) {
      return { ok: false, error: "Reset de senha não configurado. Defina PASSWORD_RESET_SECRET no Railway." };
    }
    if (!secret) {
      return { ok: false, error: "Código de reset obrigatório (sistema já tem admin cadastrado)." };
    }
    if (secret !== expectedSecret) {
      return { ok: false, error: "Código de reset inválido." };
    }
  }

  try {
    const user = await prisma.user.findUnique({ where: { cpf }, select: { id: true } });
    const hashed = await bcrypt.hash(novaSenha, 10);
    if (user) {
      await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
      return { ok: true, message: "Senha redefinida com sucesso. Redirecionando para login..." };
    }
    // Bootstrap: cria User admin se não existir (protegido pelo PASSWORD_RESET_SECRET).
    // Útil quando o seed ainda não rodou ou o User foi removido. Você troca nome/email
    // depois em /configuracoes (ou diretamente no banco).
    await prisma.user.create({
      data: {
        cpf,
        password: hashed,
        name: "Admin",
        email: `admin+${cpf}-${Date.now()}@onixcapital.local`,
        role: "admin",
      },
    });
    return {
      ok: true,
      message: "Usuário admin criado e senha definida. Redirecionando para login...",
    };
  } catch (e) {
    console.error("Reset password error:", e);
    return { ok: false, error: "Erro ao redefinir senha." };
  }
}
