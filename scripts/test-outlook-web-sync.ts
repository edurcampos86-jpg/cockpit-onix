/**
 * Teste em shadow-DB do caminho de dados de POST /api/integracoes/outlook-web/sync.
 *
 * Como rodar (NUNCA contra produção — aborta se o host não for local):
 *   DATABASE_URL="postgresql://onix:onix@localhost:5432/shadow_onix" \
 *     npx tsx --conditions=react-server scripts/test-outlook-web-sync.ts
 *
 * A flag --conditions=react-server é obrigatória. src/lib/reunioes.ts — e
 * outros ~59 arquivos — importam "server-only", cujo `exports` mapeia
 * `react-server` para um módulo vazio e `default` para um `index.js` que é um
 * `throw` explícito. Sem a condição, importar módulo de servidor fora do Next
 * estoura com "This module cannot be imported from a Client Component module",
 * que é o pacote funcionando como projetado — não um defeito a contornar.
 *
 * Usa as MESMAS funções que a rota importa — buildClienteIndex,
 * matchEventToClientes, upsertReuniao, recomputeAgregadosBatch e o
 * externalIdDe exportado pela própria rota. Não exercita HTTP nem a guarda de
 * admin: cobre o caminho de dados, que é onde mora o risco de duplicar linha.
 *
 * Cenário: 1 evento com 2 e-mails de participante casando 2 clientes
 * diferentes, mais um terceiro cliente que não deve casar (controle contra
 * match frouxo). Roda duas vezes para provar idempotência.
 *
 * DESTRUTIVO: limpa ReuniaoCliente, ClienteBackoffice e User antes de semear.
 */
async function main() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error(`ABORTA: DATABASE_URL não é local (host=${u.hostname})`);
  }

  // Imports dinâmicos: só acontecem depois da guarda de host acima, para um
  // DATABASE_URL apontando para produção abortar antes de qualquer conexão.
  const { prisma } = await import("@/lib/prisma");
  const { buildClienteIndex, matchEventToClientes } = await import(
    "@/lib/integrations/google-calendar-match"
  );
  const { upsertReuniao, recomputeAgregadosBatch } = await import("@/lib/reunioes");
  const { externalIdDe } = await import(
    "@/app/api/integracoes/outlook-web/sync/route"
  );

  const EVENTO = {
    titulo: "Revisão de carteira — Q3",
    inicio: new Date("2026-08-14T14:00:00.000Z"),
    fim: new Date("2026-08-14T15:00:00.000Z"),
    emailsParticipantes: ["ana.ribeiro@exemplo.com", "bruno.tavares@exemplo.com"],
    emailOrganizador: "eduardo@onix.com",
  };

  async function rodada(userId: string, n: number) {
    const clientes = await prisma.clienteBackoffice.findMany({
      select: { id: true, nome: true, nomeCompleto: true, apelido: true, email: true },
    });
    const index = buildClienteIndex(clientes);
    const externalId = externalIdDe(EVENTO.titulo, EVENTO.inicio, EVENTO.emailOrganizador);

    const casados = matchEventToClientes(
      {
        attendees: EVENTO.emailsParticipantes,
        organizer: EVENTO.emailOrganizador,
        summary: EVENTO.titulo,
      },
      index,
    );

    const afetados = new Set<string>();
    let upserts = 0;
    const resultados: string[] = [];
    for (const m of casados) {
      const r = await upsertReuniao({
        clienteId: m.clienteId,
        userId,
        source: "outlook-web",
        externalId,
        startAt: EVENTO.inicio,
        endAt: EVENTO.fim,
        titulo: EVENTO.titulo,
        matchedVia: m.via,
        rawPayload: { titulo: EVENTO.titulo },
      });
      resultados.push(r);
      if (r !== "noop") {
        upserts++;
        afetados.add(m.clienteId);
      }
    }
    const { atualizados } = await recomputeAgregadosBatch([...afetados]);
    const linhas = await prisma.reuniaoCliente.count({ where: { source: "outlook-web" } });

    console.log(
      `  rodada ${n}: matches=${casados.length} upserts=${upserts} ` +
        `recomputados=${atualizados} linhas=${linhas} [${resultados.join(",") || "-"}]`,
    );
    return { matches: casados.length, upserts, linhas, externalId };
  }

  await prisma.reuniaoCliente.deleteMany({});
  await prisma.clienteBackoffice.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({
    data: { name: "Eduardo", cpf: "00000000000", email: "eduardo@onix.com", password: "x" },
  });
  const ana = await prisma.clienteBackoffice.create({
    data: { nome: "Ana Ribeiro", numeroConta: "111111", email: "ana.ribeiro@exemplo.com" },
  });
  const bruno = await prisma.clienteBackoffice.create({
    data: { nome: "Bruno Tavares", numeroConta: "222222", email: "bruno.tavares@exemplo.com" },
  });
  await prisma.clienteBackoffice.create({
    data: { nome: "Carla Nunes", numeroConta: "333333", email: "carla@outro.com" },
  });
  console.log("  seed: 1 user + 3 clientes (2 devem casar, 1 é controle)\n");

  const r1 = await rodada(user.id, 1);
  const r2 = await rodada(user.id, 2);

  const linhas = await prisma.reuniaoCliente.findMany({
    where: { source: "outlook-web" },
    select: { clienteId: true, externalId: true, matchedVia: true, matchScore: true },
  });
  const nomes = new Map([
    [ana.id, "Ana Ribeiro"],
    [bruno.id, "Bruno Tavares"],
  ]);
  console.log("\n  linhas gravadas:");
  for (const l of linhas) {
    console.log(
      `    ${(nomes.get(l.clienteId) ?? l.clienteId).padEnd(15)} via=${l.matchedVia} ` +
        `score=${l.matchScore} externalId=${l.externalId.slice(0, 14)}…`,
    );
  }

  const agg = await prisma.clienteBackoffice.findMany({
    where: { id: { in: [ana.id, bruno.id] } },
    select: { nome: true, proximaReuniaoAt: true },
  });
  console.log("\n  agregados após recompute:");
  for (const a of agg) {
    console.log(
      `    ${a.nome.padEnd(15)} proximaReuniaoAt=${a.proximaReuniaoAt?.toISOString() ?? "null"}`,
    );
  }

  console.log("\n  ── asserts ──");
  let falhas = 0;
  const check = (nome: string, ok: boolean, detalhe: string) => {
    if (!ok) falhas++;
    console.log(`    ${ok ? "PASSA" : "FALHA"}  ${nome} — ${detalhe}`);
  };

  check("2 clientes casados", r1.matches === 2, `matches=${r1.matches}`);
  check("2 linhas gravadas", r1.linhas === 2, `linhas=${r1.linhas}`);
  check("1a rodada faz upsert", r1.upserts === 2, `upserts=${r1.upserts}`);
  check("2a rodada e noop", r2.upserts === 0, `upserts=${r2.upserts}`);
  check("2a rodada nao duplica", r2.linhas === 2, `linhas=${r2.linhas}`);
  check(
    "externalId estavel entre rodadas",
    r1.externalId === r2.externalId,
    r1.externalId.slice(0, 20) + "…",
  );
  check(
    "casou por e-mail (score 100)",
    linhas.length > 0 && linhas.every((l) => l.matchScore === 100),
    `scores=${linhas.map((l) => l.matchScore).join(",")}`,
  );
  check("cliente de controle nao casou", linhas.length === 2, `${linhas.length} linhas`);

  await prisma.$disconnect();
  if (falhas > 0) {
    console.log(`\n  ${falhas} assert(s) falharam.`);
    process.exit(1);
  }
  console.log("\n  todos os asserts passaram.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Marca o arquivo como MÓDULO. Sem nenhum import de topo (os imports
// aqui são dinâmicos, dentro de main), o TypeScript trataria isto como script
// global e o `main` colidiria com o de outro script em scripts/ — que o build
// type-checa junto.
export {};
