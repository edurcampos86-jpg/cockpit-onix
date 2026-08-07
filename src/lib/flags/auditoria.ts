import "server-only";
import { prisma } from "@/lib/prisma";
import { envUtilizavel } from "@/lib/config-db";

/**
 * Escrita de flag COM auditoria — a única forma de gravar pela tela.
 *
 * Existe para dar ATOMICIDADE ao par (mudar, registrar). Chamar `setConfig` e
 * depois inserir a linha de auditoria deixaria a janela em que a config muda e
 * o registro não entra: numa trilha de auditoria, "mudou e ninguém sabe quem"
 * é exatamente o caso que ela deveria impedir. Aqui os dois vão na MESMA
 * transação — ou entram juntos, ou nenhum entra.
 *
 * O valor anterior é lido DENTRO da transação, não antes: dois admins virando a
 * mesma chave ao mesmo tempo gravariam `de` iguais e a trilha passaria a contar
 * uma história que não aconteceu.
 *
 * `de` guarda o valor EFETIVO de antes, não só a linha do banco: com o valor
 * vindo do env e nenhuma linha em `Config`, registrar `de: null` leria como
 * "não havia nada", quando na prática a flag estava valendo. A precedência é a
 * mesma do `getConfig` (banco → env), com a mesma régua de `envUtilizavel`.
 *
 * SEGREDO: `de` e `para` guardam valor cru. A rota chamadora só aceita chaves da
 * allowlist de `lib/flags/registro.ts`, e é isso que mantém token fora daqui.
 * Qualquer novo chamador precisa respeitar a mesma allowlist.
 */
export async function gravarFlagComAuditoria(params: {
  key: string;
  valor: string;
  quemId: string | null;
  quemEmail: string | null;
}): Promise<{ de: string | null; para: string }> {
  const { key, valor, quemId, quemEmail } = params;

  return prisma.$transaction(async (tx) => {
    const linha = await tx.config.findUnique({
      where: { key },
      select: { value: true },
    });

    const doBanco = linha?.value ? linha.value : undefined;
    const doEnv = envUtilizavel(process.env[key]) ? process.env[key] : undefined;
    const de = doBanco ?? doEnv ?? null;

    await tx.config.upsert({
      where: { key },
      create: { key, value: valor },
      update: { value: valor },
    });

    await tx.configAudit.create({
      data: { key, de, para: valor, quemId, quemEmail },
    });

    return { de, para: valor };
  });
}
