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

  const [
    { schedule },
    { getConfig },
    { runDatacrazyPollLogged, checkDatacrazyPollFreshness },
    { verificarFreshnessBtg },
  ] = await Promise.all([
    import("node-cron"),
    import("@/lib/config-db"),
    import("@/lib/integrations/datacrazy-poll-runner"),
    import("@/lib/backoffice/btg-freshness"),
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

  // Heartbeat de freshness BTG in-process — ADITIVO ao GHA (cron.yml segue como
  // observador externo, capaz de detectar ESTE processo morto; por isso o GHA
  // NÃO é aposentado). A cada 30min, 7 dias: fecha o buraco de fim de semana do
  // cron GHA (seg-sex, 1x/dia). Gated por Config DB BTG_FRESHNESS_INPROCESS,
  // DEFAULT OFF (lido a cada tick → liga/desliga sem deploy). O spam do aumento
  // de frequência é contido pelo throttle por-key no caminho do alerta (cooldown
  // em Config DB), agnóstico de origem — GHA e tick compartilham a janela.
  schedule("*/30 * * * *", async () => {
    try {
      const flag = (await getConfig("BTG_FRESHNESS_INPROCESS"))?.trim().toLowerCase();
      if (flag !== "on" && flag !== "true" && flag !== "1") return;

      // Mesma ordem da rota /api/cron/btg-freshness: dados BTG, depois poll.
      const r = await verificarFreshnessBtg();
      const poll = await checkDatacrazyPollFreshness();
      const stales = r.itens.filter((i) => i.stale).map((i) => i.id);
      const alertas = [
        r.alertaEnviado && "dados",
        r.warningEnviado && "fonte",
        poll.alertou && "poll",
      ].filter(Boolean);
      console.log(
        `[freshness-inprocess] ok: ${r.ok} · dados stale=[${stales.join(",") || "-"}] · ` +
          `poll=${poll.ok ? "ok" : `STALE(${poll.idadeMin ?? "?"}min)`}` +
          `${alertas.length ? ` · alertas enviados: ${alertas.join(",")}` : ""}`,
      );
    } catch (e) {
      console.error("[freshness-inprocess] erro no tick:", e);
    }
  });

  console.log(
    "[instrumentation] scheduler btg-freshness in-process registrado (a cada 30min, 7 dias, gated por Config DB BTG_FRESHNESS_INPROCESS, default OFF; aditivo ao GHA)",
  );
}
