/**
 * Next.js instrumentation — roda 1x no boot do servidor (next start, runtime
 * Node). Aqui registramos o scheduler IN-PROCESS do poll da Datacrazy, que é a
 * via confiável de alimentar "Último contato" sem depender do GHA (que estrangula
 * o cron de 5 min → roda só ~a cada 1-2h). Ver memória do bug e a PR de migração.
 *
 * SUPOSIÇÃO DE 1 RÉPLICA: assume `numReplicas = 1` (fixado no railway.toml). Com
 * >1 réplica cada uma registraria este scheduler → polls concorrentes. É INÓCUO
 * no dado (poll idempotente: guard `lt` em ultimoContatoAt + short-circuit por
 * conversaExistente), mas dobraria as chamadas à API Datacrazy. Se um dia escalar
 * horizontalmente, trocar por lock (advisory lock no Postgres) ou cron dedicado.
 */
export async function register() {
  // Só no runtime Node (não no edge). Evita também carregar node-cron/server-only
  // fora do servidor.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ schedule }, { getConfig }, { runDatacrazyPollLogged }] = await Promise.all([
    import("node-cron"),
    import("@/lib/config-db"),
    import("@/lib/integrations/datacrazy-poll-runner"),
  ]);

  // A cada 15min. Mudar o intervalo exige deploy (não parametrizado de propósito
  // — o cutoff de 720min já absorve folga de horário).
  schedule("*/15 * * * *", async () => {
    try {
      // Gate por Config DB, DEFAULT OFF: só roda se a flag estiver ligada.
      // Lido a cada tick → ligar/desligar é reversível SEM deploy.
      const flag = (await getConfig("DATACRAZY_POLL_INPROCESS"))?.trim().toLowerCase();
      if (flag !== "on" && flag !== "true" && flag !== "1") return;

      const { result, skipped } = await runDatacrazyPollLogged("in-process");
      if (skipped) {
        console.warn(`[datacrazy-inprocess] pulado: ${skipped}`);
      } else if (result) {
        console.log(
          `[datacrazy-inprocess] ok: ${result.conversasVistas} vistas · ${result.conversasComMudanca} delta · ${result.mensagensNovas} msgs · ${result.erros.length} erros`,
        );
      }
    } catch (e) {
      console.error("[datacrazy-inprocess] erro no tick:", e);
    }
  });

  console.log(
    "[instrumentation] scheduler datacrazy-poll in-process registrado (a cada 15min, gated por Config DB DATACRAZY_POLL_INPROCESS, default OFF)",
  );
}
