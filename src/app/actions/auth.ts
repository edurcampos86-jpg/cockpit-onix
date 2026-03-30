"use server";

import { prisma } from "@/lib/prisma";
import { createSession, deleteSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

export type LoginState = {
  error?: string;
} | undefined;

export async function login(state: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Preencha todos os campos." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return { error: "E-mail ou senha incorretos." };
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return { error: "E-mail ou senha incorretos." };
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
