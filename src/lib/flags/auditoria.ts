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
 *
 * ── NÃO-MUDANÇA NÃO ENTRA NA TRILHA ──────────────────────────────────────
 * Se o valor efetivo já é o pedido, a função não escreve NADA e devolve
 * `mudou: false`. MEDIDO antes disso existir: um POST com `ligada: true` numa
 * flag que já valia `1` gravava `HUB_ECOSSISTEMA · 1 → 1` no histórico.
 *
 * Linha que não representa mudança é ruído no único rastro que sobrevive à
 * rotação do log — e é numa investigação de incidente, lendo a trilha de trás
 * para frente, que ela mais atrapalha.
 *
 * O `upsert` é pulado JUNTO, não só o INSERT de auditoria. Dois motivos:
 *   • ele mexeria em `Config.updatedAt`, e a tela mostra isso como "quando
 *     mudou" — seria a mesma mentira da linha de auditoria, em outro campo;
 *   • quando o valor vem do ENV e não há linha em `Config`, gravar criaria a
 *     linha e a flag passaria a ter DUAS fontes com o mesmo valor. É
 *     exatamente o que o toggle travado da tela existe para impedir; sem esta
 *     guarda, um POST direto na rota contornaria a trava sem mudar nada.
 */
export async function gravarFlagComAuditoria(params: {
  key: string;
  valor: string;
  quemId: string | null;
  quemEmail: string | null;
}): Promise<{ de: string | null; para: string; mudou: boolean }> {
  const { key, valor, quemId, quemEmail } = params;

  return prisma.$transaction(async (tx) => {
    const linha = await tx.config.findUnique({
      where: { key },
      select: { value: true },
    });

    const doBanco = linha?.value ? linha.value : undefined;
    const doEnv = envUtilizavel(process.env[key]) ? process.env[key] : undefined;
    const de = doBanco ?? doEnv ?? null;

    /* Comparação de valor CRU, não de "ligada?": `1` e `true` significam o
     * mesmo para o dialeto, mas gravar um por cima do outro É mudança de dado e
     * merece registro. Só a igualdade literal é não-mudança. Na prática a tela
     * só escreve `1`/`0` (`valorParaGravar`), então o caso comum já casa. */
    if (de === valor) return { de, para: valor, mudou: false };

    await tx.config.upsert({
      where: { key },
      create: { key, value: valor },
      update: { value: valor },
    });

    await tx.configAudit.create({
      data: { key, de, para: valor, quemId, quemEmail },
    });

    return { de, para: valor, mudou: true };
  });
}
