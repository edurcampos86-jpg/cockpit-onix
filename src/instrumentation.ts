/**
 * Hook de boot do Next.js. Roda uma única vez quando o servidor sobe.
 *
 * Em produção, faz fail-fast se variáveis OBRIGATÓRIAS de segurança
 * estiverem ausentes ou fracas. Em dev, apenas avisa.
 */
export async function register() {
  // Só roda no runtime Node (não Edge) e só uma vez no boot.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { runEnvChecks, reportEnvChecks } = await import(
    "../scripts/verify-security-env"
  );
  const result = runEnvChecks();
  reportEnvChecks(result);

  if (!result.ok && process.env.NODE_ENV === "production") {
    // throw aborta o boot do servidor Next (mesmo efeito de process.exit
    // em Node, e compatível com Edge runtime onde process.exit não existe).
    throw new Error(
      "[boot] variáveis de segurança obrigatórias ausentes em produção — veja log acima.",
    );
  }
}
