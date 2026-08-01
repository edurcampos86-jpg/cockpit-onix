/**
 * Teste em shadow-DB da procedência gravada pelo recompute de reuniões.
 *
 * Como rodar (NUNCA contra produção — aborta se o host não for local):
 *   DATABASE_URL="postgresql://onix:onix@localhost:5432/shadow_mig" \
 *     npx tsx --conditions=react-server scripts/test-reuniao-fonte-selo.ts
 *
 * A flag --conditions=react-server é obrigatória: lib/reunioes.ts importa
 * "server-only", cujo `exports` só devolve módulo vazio sob essa condição.
 *
 * Cobre o que a UI vai consumir:
 *   - source da linha VENCEDORA é gravado em ultima/proximaReuniaoSource
 *   - matchedVia="manual" vira o booleano do selo, e é eixo INDEPENDENTE da
 *     fonte (uma reunião google-cal pode ter selo)
 *   - sem confirmação manual, o booleano fica false (ausência de selo)
 *   - quando a última linha some, data, fonte e selo zeram JUNTOS
 *
 * DESTRUTIVO: limpa ReuniaoCliente, ClienteBackoffice e User antes de semear.
 */

async function main() {
  const u = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(u.hostname)) {
    throw new Error(`ABORTA: DATABASE_URL não é local (host=${u.hostname})`);
  }

  const { prisma } = await import("@/lib/prisma");
  const { upsertReuniao, recomputeAgregadosReuniao } = await import("@/lib/reunioes");

  await prisma.reuniaoCliente.deleteMany({});
  await prisma.clienteBackoffice.deleteMany({});
  await prisma.user.deleteMany({});

  const criarCliente = (nome: string, conta: string) =>
    prisma.clienteBackoffice.create({ data: { nome, numeroConta: conta } });

  const comSelo = await criarCliente("Com Selo", "000000001");
  const semSelo = await criarCliente("Sem Selo", "000000002");
  const zerado = await criarCliente("Vai Zerar", "000000003");

  const ONTEM = new Date(Date.now() - 24 * 3600 * 1000);
  const AMANHA = new Date(Date.now() + 24 * 3600 * 1000);

  // comSelo: reunião do GOOGLE, ligada à MÃO. Fonte e selo são eixos
  // independentes — tem de sair "google-cal" + selo, não "manual".
  await upsertReuniao({
    clienteId: comSelo.id, source: "google-cal", externalId: "ev-1",
    startAt: ONTEM, matchedVia: "manual",
  });
  await upsertReuniao({
    clienteId: comSelo.id, source: "outlook-web", externalId: "ev-2",
    startAt: AMANHA, matchedVia: "manual",
  });

  // semSelo: casada por e-mail, sem intervenção humana.
  await upsertReuniao({
    clienteId: semSelo.id, source: "datacrazy-atividade", externalId: "ev-3",
    startAt: ONTEM, matchedVia: "email",
  });

  // zerado: ganha uma reunião e depois perde.
  await upsertReuniao({
    clienteId: zerado.id, source: "outlook-ics", externalId: "ev-4",
    startAt: ONTEM, matchedVia: "manual",
  });

  for (const c of [comSelo, semSelo, zerado]) await recomputeAgregadosReuniao(c.id);

  const ler = async (id: string) =>
    prisma.clienteBackoffice.findUniqueOrThrow({
      where: { id },
      select: {
        nome: true,
        ultimaReuniaoAt: true, ultimaReuniaoSource: true,
        ultimaReuniaoConfirmadaManualmente: true,
        proximaReuniaoAt: true, proximaReuniaoSource: true,
        proximaReuniaoConfirmadaManualmente: true,
      },
    });

  const a = await ler(comSelo.id);
  const b = await ler(semSelo.id);

  console.log("  estado após recompute:");
  for (const c of [a, b]) {
    console.log(
      `    ${c.nome.padEnd(9)} ultima=${c.ultimaReuniaoSource ?? "null"}/${c.ultimaReuniaoConfirmadaManualmente}` +
        `  proxima=${c.proximaReuniaoSource ?? "null"}/${c.proximaReuniaoConfirmadaManualmente}`,
    );
  }

  // Remove a única reunião do "zerado" e recomputa.
  await prisma.reuniaoCliente.deleteMany({ where: { clienteId: zerado.id } });
  await recomputeAgregadosReuniao(zerado.id);
  const z = await ler(zerado.id);

  console.log("\n  ── asserts ──");
  let falhas = 0;
  const check = (nome: string, ok: boolean, detalhe: string) => {
    if (!ok) falhas++;
    console.log(`    ${ok ? "PASSA" : "FALHA"}  ${nome} — ${detalhe}`);
  };

  check("fonte da ultima é gravada", a.ultimaReuniaoSource === "google-cal", `${a.ultimaReuniaoSource}`);
  check("fonte da proxima é gravada", a.proximaReuniaoSource === "outlook-web", `${a.proximaReuniaoSource}`);
  check("selo com matchedVia=manual", a.ultimaReuniaoConfirmadaManualmente === true, `${a.ultimaReuniaoConfirmadaManualmente}`);
  check("selo na proxima também", a.proximaReuniaoConfirmadaManualmente === true, `${a.proximaReuniaoConfirmadaManualmente}`);
  // A reunião foi ligada à mão (matchedVia="manual") mas veio do Google. O
  // source tem de continuar "google-cal": "manual" não é fonte, é selo. Basta
  // afirmar o valor esperado — comparar com "manual" seria redundante, e o
  // TypeScript reclama porque já sabe que não pode ser.
  check(
    "selo NÃO vira fonte (segue google-cal)",
    a.ultimaReuniaoSource === "google-cal",
    `${a.ultimaReuniaoSource}`,
  );
  check("sem confirmação manual → sem selo", b.ultimaReuniaoConfirmadaManualmente === false, `${b.ultimaReuniaoConfirmadaManualmente}`);
  check("fonte gravada mesmo sem selo", b.ultimaReuniaoSource === "datacrazy-atividade", `${b.ultimaReuniaoSource}`);
  check("sem próxima reunião → fonte null", b.proximaReuniaoSource === null, `${b.proximaReuniaoSource}`);
  check("sem próxima reunião → selo false", b.proximaReuniaoConfirmadaManualmente === false, `${b.proximaReuniaoConfirmadaManualmente}`);
  check("reunião removida zera data", z.ultimaReuniaoAt === null, `${z.ultimaReuniaoAt}`);
  check("reunião removida zera fonte", z.ultimaReuniaoSource === null, `${z.ultimaReuniaoSource}`);
  check("reunião removida zera selo", z.ultimaReuniaoConfirmadaManualmente === false, `${z.ultimaReuniaoConfirmadaManualmente}`);

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
