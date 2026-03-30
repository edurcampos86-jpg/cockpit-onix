"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import bcrypt from "bcryptjs";

export type ChangePasswordState = {
  success?: boolean;
  error?: string;
} | undefined;

export async function changePassword(
  state: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Preencha todos os campos." };
  }

  if (newPassword.length < 6) {
    return { error: "A nova senha deve ter pelo menos 6 caracteres." };
  }

  if (newPassword !== confirmPassword) {
    return { error: "A nova senha e a confirmação não coincidem." };
  }

  if (currentPassword === newPassword) {
    return { error: "A nova senha deve ser diferente da senha atual." };
  }

  try {
    const session = await getSession();
    if (!session) {
      return { error: "Sessão expirada. Faça login novamente." };
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user) {
      return { error: "Usuário não encontrado." };
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return { error: "Senha atual incorreta." };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: session.userId },
      data: { password: hashedPassword },
    });

    return { success: true };
  } catch (error) {
    console.error("Change password error:", error);
    return { error: "Erro ao alterar a senha. Tente novamente." };
  }
}
