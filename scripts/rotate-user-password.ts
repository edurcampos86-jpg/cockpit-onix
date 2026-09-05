/**
 * Rotaciona a senha de um usuário do Cockpit.
 *
 * Uso:
 *   DATABASE_URL=postgres://... tsx scripts/rotate-user-password.ts <cpf>
 *
 * - O CPF pode vir formatado ("015.362.475-29") ou só dígitos ("01536247529").
 * - A senha NÃO é argv: o script lê do stdin oculto (TTY) para não vazar em
 *   shell history, ps aux ou logs do Railway.
 * - Faz hash bcrypt com cost 12 e UPDATE direto na tabela User.
 * - Falha se o usuário não existir (não cria conta nova por engano).
 *
 * Caso prefira rotacionar via UI, faça login no app e use /configuracoes.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import * as readline from "node:readline";

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("stdin não é TTY — execute interativamente."));
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Esconde o eco enquanto a senha é digitada.
    const stdoutWrite = process.stdout.write.bind(process.stdout);
    let muted = false;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (chunk: string) => {
      if (muted) stdoutWrite("*");
      else stdoutWrite(chunk);
    };
    rl.question(prompt, (answer) => {
      muted = false;
      stdoutWrite("\n");
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const cpfArg = process.argv[2];
  if (!cpfArg) {
    console.error("Uso: tsx scripts/rotate-user-password.ts <cpf>");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não setada.");
    process.exit(2);
  }

  const cpf = onlyDigits(cpfArg);
  if (cpf.length !== 11) {
    console.error(`CPF inválido (${cpfArg}) — esperado 11 dígitos.`);
    process.exit(2);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({
      where: { cpf },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      console.error(`Usuário com CPF ${cpfArg} não encontrado.`);
      process.exit(1);
    }

    console.log(`Encontrado: ${user.name} <${user.email}> (role=${user.role})`);
    const password = await readSecret("Nova senha: ");
    const confirm = await readSecret("Confirme a senha: ");
    if (password !== confirm) {
      console.error("As senhas não conferem.");
      process.exit(1);
    }
    if (password.length < 12) {
      console.error("Senha curta demais — mínimo 12 caracteres.");
      process.exit(1);
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash } });
    console.log(`Senha rotacionada para ${user.name}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
