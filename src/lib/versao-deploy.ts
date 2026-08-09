/* ──────────────────────────────────────────────────────────────
 * Qual versão está no ar — módulo PURO (só lê process.env).
 *
 * Sem prisma e sem `server-only` de propósito: assim o teste roda no
 * `tsx --test` e a normalização (sha curto, ausências) fica coberta.
 *
 * As variáveis são injetadas pelo Railway em RUNTIME, não em build. Por isso a
 * leitura acontece a cada chamada e não numa constante de módulo: numa app com
 * output standalone, uma constante congelaria o valor do build.
 * ────────────────────────────────────────────────────────────── */

export type VersaoDeploy = {
  /** Commit no ar. `null` fora do Railway (dev local). */
  sha: string | null;
  /** Os 7 primeiros do sha — o formato que se compara com `git log --oneline`. */
  shaCurto: string | null;
  branch: string | null;
  /**
   * Nome do environment no Railway (`production`, `staging`, …). É o campo que
   * responde "em qual ambiente eu bati?" sem depender de decorar URLs — a
   * pergunta que travou a tentativa de ligar o hub fora de produção.
   */
  ambiente: string | null;
  /** Id do deployment; serve para achar o build exato no painel do Railway. */
  deploymentId: string | null;
};

/** Vazio, espaço em branco e literal "unknown" contam como ausente. */
function limpar(valor: string | undefined): string | null {
  const v = valor?.trim();
  if (!v || v.toLowerCase() === "unknown") return null;
  return v;
}

export function versaoDeploy(): VersaoDeploy {
  const sha = limpar(process.env.RAILWAY_GIT_COMMIT_SHA);
  return {
    sha,
    shaCurto: sha ? sha.slice(0, 7) : null,
    branch: limpar(process.env.RAILWAY_GIT_BRANCH),
    ambiente: limpar(process.env.RAILWAY_ENVIRONMENT_NAME),
    deploymentId: limpar(process.env.RAILWAY_DEPLOYMENT_ID),
  };
}
