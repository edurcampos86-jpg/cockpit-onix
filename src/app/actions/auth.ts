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
