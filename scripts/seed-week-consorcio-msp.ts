/**
 * Roteiros + posts da semana — tema: Consórcio + Meu Sucesso Patrimonial.
 *
 * Idempotente: identifica cada post pelo par (authorId, scheduledDate, category)
 * e faz update no que já existe. Tarefas (roteiro/gravação/edição/publicação)
 * só são criadas se ainda não houver tarefa do mesmo `type` para o post.
 *
 * Janela alvo: segunda-feira da semana que contém amanhã (para que o script
 * rodado num domingo aponte para a próxima semana, e rodado num dia útil
 * aponte para a semana corrente).
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/seed-week-consorcio-msp.ts
 *   # ou para forçar uma semana específica:
 *   WEEK_START=2026-04-27 npx tsx scripts/seed-week-consorcio-msp.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type RoteiroPlano = {
  dayOffset: number;
  format: "reel" | "story" | "carrossel";
  category:
    | "pergunta_semana"
    | "onix_pratica"
    | "patrimonio_mimimi"
    | "alerta_patrimonial"
    | "sabado_bastidores";
  time: string;
  ctaType: "explicito" | "implicito" | "identificacao";
  postTitle: string;
  scriptTitle: string;
  hook: string;
  body: string;
  cta: string;
  estimatedTime: string;
  hashtags: string;
};

const PLANO: RoteiroPlano[] = [
  {
    dayOffset: 0, // Segunda
    format: "story",
    category: "pergunta_semana",
    time: "11:00",
    ctaType: "identificacao",
    postTitle:
      "Pergunta da Semana: você troca financiamento por consórcio se eu te mostrar a conta?",
    scriptTitle: "Roteiro — Pergunta da Semana | Consórcio vs Financiamento",
    hook: "Sua família precisa decidir agora: financiar a casa ou entrar num consórcio. Você sabe diferenciar o que sai mais caro daqui a 10 anos?",
    body: [
      "GANCHO (0-3s): Pergunta direta na câmera, com tom de cumplicidade.",
      "  \"Você troca financiamento por consórcio se eu te mostrar a conta?\"",
      "",
      "DESENVOLVIMENTO (3-20s):",
      "  • Financiamento = juros sobre saldo devedor + IOF + seguros obrigatórios.",
      "  • Consórcio = taxa de administração diluída + fundo de reserva. Sem juros mensais.",
      "  • Em horizontes longos (>10 anos), a diferença passa fácil de 30% do TCO.",
      "  • Mas tem porém: liquidez do bem só na contemplação.",
      "",
      "FECHAMENTO (20-30s):",
      "  Convite para responder na enquete dos Stories e antecipar o tema da semana",
      "  (consórcio na prática, mitos, alerta sobre decisão sem método).",
    ].join("\n"),
    cta: "Responde nos Stories: você já fez consórcio? E topa ver a conta nos próximos vídeos?",
    estimatedTime: "15-30s",
    hashtags: "consorcio,financiamento,patrimonio,decisaopatrimonial",
  },
  {
    dayOffset: 1, // Terça
    format: "reel",
    category: "onix_pratica",
    time: "12:00",
    ctaType: "implicito",
    postTitle:
      "Onix na Prática: como um cirurgião comprou a sala da clínica via consórcio sem travar o caixa",
    scriptTitle: "Roteiro — Onix na Prática | Consórcio imobiliário (cirurgião)",
    hook: "Cliente ia financiar uma sala comercial de R$ 1,2 milhão a 11% ao ano. Mostramos uma rota que custou 32% a menos.",
    body: [
      "GANCHO (0-3s): Frase forte com número.",
      "  \"R$ 420 mil. Foi quanto a gente economizou para um cirurgião que ia financiar a sala.\"",
      "",
      "CASO (3-50s) — anonimizado:",
      "  • Cirurgião, PJ médica, queria sala comercial em Salvador (R$ 1,2M).",
      "  • Caminho original: financiamento 240 meses, juros ~11% a.a., parcela travando o caixa da PJ.",
      "  • Caminho Onix: consórcio imobiliário com lance embutido + reserva em CDI até a contemplação.",
      "  • Resultado: ~32% de economia projetada no TCO em 12 anos e R$ 180 mil em liquidez preservada.",
      "",
      "PRINCÍPIO (50-75s):",
      "  Consórcio não é mágica. É boa ferramenta quando casa com:",
      "    1) horizonte compatível (>5 anos),",
      "    2) geração de caixa estável,",
      "    3) disciplina de lance.",
      "",
      "FECHAMENTO (75-90s):",
      "  Convite implícito: 'Se a sua situação parece com a desse cirurgião, link na bio.'",
    ].join("\n"),
    cta: "Se você está nessa situação, link na bio para uma conversa.",
    estimatedTime: "60-90s",
    hashtags: "consorcioimobiliario,medicos,patrimonio,onixcapital",
  },
  {
    dayOffset: 2, // Quarta
    format: "reel",
    category: "patrimonio_mimimi",
    time: "12:00",
    ctaType: "identificacao",
    postTitle:
      "Patrimônio sem Mimimi: 'consórcio é golpe' — o mito que custa milhões",
    scriptTitle: "Roteiro — Patrimônio sem Mimimi | Mito do consórcio",
    hook: "Tem influencer afirmando que consórcio é golpe. Vou te mostrar onde nasce esse mito — e quando ele de fato acontece.",
    body: [
      "GANCHO (0-5s): Provocação direta.",
      "  \"Consórcio é golpe? Em 19 anos de assessoria eu te garanto: o golpe não está no produto.\"",
      "",
      "DESMONTANDO O MITO (5-40s):",
      "  • Consórcio é regulado pelo Bacen (Lei 11.795/08). Não é pirâmide.",
      "  • O problema é a falta de método de quem entra: vai pelo discurso do vendedor, não pela tese.",
      "  • Quando dá errado: pessoa precisa do bem AGORA, não tem disciplina, ou compra sem entender taxa de administração.",
      "",
      "QUANDO É PRA VOCÊ (40-65s) — 3 sinais:",
      "  1) Horizonte > 5 anos para o bem.",
      "  2) Caixa estável que aguenta a parcela sem aperto.",
      "  3) Objetivo claro (imóvel, frota, equipamento da clínica).",
      "",
      "QUANDO NÃO É (65-80s) — 3 sinais:",
      "  1) Você precisa do bem em menos de 24 meses.",
      "  2) Sua renda oscila demais.",
      "  3) Você não consegue dar lance estratégico.",
      "",
      "FECHAMENTO (80-90s):",
      "  \"Ferramenta financeira não tem moral, tem encaixe. Salva esse vídeo pra rever antes da próxima decisão.\"",
    ].join("\n"),
    cta: "Salva esse vídeo pra rever antes da próxima decisão patrimonial.",
    estimatedTime: "60-90s",
    hashtags: "consorcio,mitos,planejamentopatrimonial,bacen",
  },
  {
    dayOffset: 3, // Quinta
    format: "reel",
    category: "alerta_patrimonial",
    time: "12:00",
    ctaType: "explicito", // ÚNICO explícito da semana (respeita 80/20)
    postTitle:
      "ALERTA: o método que estamos lançando para parar de decidir patrimônio no escuro — Meu Sucesso Patrimonial",
    scriptTitle: "Roteiro — Alerta Patrimonial | Lançamento MSP",
    hook: "Toda semana eu vejo família perdendo seis dígitos por tomar decisão patrimonial sem método. É por isso que estou lançando o Meu Sucesso Patrimonial.",
    body: [
      "GANCHO (0-5s): Tom de urgência, olho na câmera.",
      "  \"Para tudo. Se você decide patrimônio pela sensação do dia, esse alerta é pra você.\"",
      "",
      "O RISCO (5-30s):",
      "  • Consórcio, previdência, sucessão, seguro de vida resgatável: cada uma dessas decisões",
      "    é tomada hoje sem método nas famílias de alta renda.",
      "  • O custo do erro só aparece 5-10 anos depois — quando já é irreversível.",
      "",
      "A SOLUÇÃO (30-60s) — apresentar o MSP:",
      "  • Meu Sucesso Patrimonial: a plataforma da Onix que estrutura sua decisão patrimonial",
      "    em etapas claras — diagnóstico, mapa de objetivos, simulação, acompanhamento.",
      "  • Pré-lançamento. Lista de espera abrindo na próxima semana.",
      "",
      "FECHAMENTO (60-75s) — CTA explícito (único da semana):",
      "  \"Comenta MSP aqui embaixo que eu te chamo no privado e te coloco na lista de espera",
      "   antes da abertura pública.\"",
      "",
      "OBSERVAÇÃO PARA GRAVAÇÃO:",
      "  Confirmar com Eduardo: copy exato do MSP (proposta de valor, módulos visíveis na plataforma)",
      "  antes de gravar. Roteiro foi montado a partir do contexto interno (seasonal-themes.ts +",
      "  claude-ai.ts) sem acesso autenticado ao dashboard.",
    ].join("\n"),
    cta: "Comenta MSP aqui embaixo que eu te chamo no privado.",
    estimatedTime: "60-90s",
    hashtags:
      "meusucessopatrimonial,planejamentopatrimonial,onixcapital,alertapatrimonial",
  },
  {
    dayOffset: 5, // Sábado
    format: "story",
    category: "sabado_bastidores",
    time: "10:00",
    ctaType: "identificacao",
    postTitle:
      "Bastidores: a primeira dashboard do Meu Sucesso Patrimonial rodando",
    scriptTitle: "Roteiro — Sábado de Bastidores | MSP",
    hook: "Tô gravando direto da sala onde o time tá testando a primeira versão da plataforma.",
    body: [
      "FRAME 1 (vertical, 5s):",
      "  Câmera na mão. Gravando dentro da sala. Tom espontâneo.",
      "  \"Sábado, 10 da manhã, e a gente tá testando a primeira versão do MSP.\"",
      "",
      "FRAME 2 (10s):",
      "  Plano da tela rapidamente — SEM dados de cliente. Só a estrutura visual.",
      "  Falar uma decisão dura: \"A gente cortou 60% das funcionalidades pra entregar o que",
      "  realmente importa: clareza de decisão.\"",
      "",
      "FRAME 3 (10s):",
      "  Por que: \"Há 10 anos eu queria uma ferramenta que pegasse pela mão a família que",
      "  tá começando a construir patrimônio. Não existia. Agora existe.\"",
      "",
      "FRAME 4 (5s):",
      "  Agradecimento ao time. Sem CTA explícito. Marca o nome MSP no canto.",
    ].join("\n"),
    cta: "",
    estimatedTime: "30-45s",
    hashtags: "bastidores,onixcapital,meusucessopatrimonial,sabadodeonix",
  },
];

function computeMonday(): Date {
  const override = process.env.WEEK_START;
  if (override) {
    const [y, m, d] = override.split("-").map(Number);
    const wd = new Date(y, m - 1, d, 0, 0, 0, 0);
    return wd;
  }
  // Padrão: segunda da semana que contém amanhã.
  const ref = new Date();
  ref.setDate(ref.getDate() + 1);
  ref.setHours(0, 0, 0, 0);
  const dow = ref.getDay(); // 0=Dom, 1=Seg ... 6=Sáb
  const monday = new Date(ref);
  monday.setDate(ref.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: "eduardo@onixcapital.com.br" },
  });
  if (!admin) {
    throw new Error(
      "Usuário admin (eduardo@onixcapital.com.br) não encontrado. Rode `npm run db:seed` antes."
    );
  }
  const support = await prisma.user.findUnique({
    where: { email: "suporte@onixcapital.com.br" },
  });
  const editorAssigneeId = support?.id ?? admin.id;

  const monday = computeMonday();
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 7);

  console.log(
    `Semana alvo: ${monday.toISOString().slice(0, 10)} → ${new Date(
      weekEnd.getTime() - 1
    )
      .toISOString()
      .slice(0, 10)}`
  );

  for (const p of PLANO) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + p.dayOffset);

    // Cria/atualiza o roteiro primeiro (sem post — vamos linkar depois).
    let script = await prisma.script.findFirst({
      where: {
        authorId: admin.id,
        title: p.scriptTitle,
        isTemplate: false,
      },
    });
    if (script) {
      // Versiona antes de atualizar.
      await prisma.scriptVersion.create({
        data: {
          scriptId: script.id,
          title: script.title,
          hook: script.hook,
          body: script.body,
          cta: script.cta,
          ctaType: script.ctaType,
          estimatedTime: script.estimatedTime,
          hashtags: script.hashtags,
          changeReason: "atualização via seed Consórcio + MSP",
        },
      });
      script = await prisma.script.update({
        where: { id: script.id },
        data: {
          category: p.category,
          hook: p.hook,
          body: p.body,
          cta: p.cta,
          ctaType: p.ctaType,
          estimatedTime: p.estimatedTime,
          hashtags: p.hashtags,
        },
      });
      console.log(`  ↻ roteiro atualizado: ${p.scriptTitle}`);
    } else {
      script = await prisma.script.create({
        data: {
          title: p.scriptTitle,
          category: p.category,
          hook: p.hook,
          body: p.body,
          cta: p.cta,
          ctaType: p.ctaType,
          estimatedTime: p.estimatedTime,
          hashtags: p.hashtags,
          isTemplate: false,
          authorId: admin.id,
        },
      });
      console.log(`  + roteiro criado:    ${p.scriptTitle}`);
    }

    // Identifica post pela combinação (author, semana, category).
    let post = await prisma.post.findFirst({
      where: {
        authorId: admin.id,
        category: p.category,
        scheduledDate: { gte: monday, lt: weekEnd },
      },
    });

    const postData = {
      title: p.postTitle,
      format: p.format,
      category: p.category,
      scheduledDate: date,
      scheduledTime: p.time,
      ctaType: p.ctaType,
      hashtags: p.hashtags,
      authorId: admin.id,
      scriptId: script.id,
    };

    if (post) {
      post = await prisma.post.update({
        where: { id: post.id },
        data: postData,
      });
      console.log(`  ↻ post atualizado:   ${p.postTitle}`);
    } else {
      post = await prisma.post.create({ data: postData });
      console.log(`  + post criado:       ${p.postTitle}`);
    }

    // Tarefas: cria por type apenas se ainda não existir.
    const taskDefs: { title: string; type: string; off: number }[] = [
      { title: `Escrever roteiro: ${p.postTitle}`, type: "roteiro", off: -3 },
      { title: `Gravar: ${p.postTitle}`, type: "gravacao", off: -2 },
      { title: `Editar: ${p.postTitle}`, type: "edicao", off: -1 },
      { title: `Publicar: ${p.postTitle}`, type: "publicacao", off: 0 },
    ];

    for (const t of taskDefs) {
      const existing = await prisma.task.findFirst({
        where: { postId: post.id, type: t.type },
      });
      if (existing) continue;

      const due = new Date(date);
      due.setDate(date.getDate() + t.off);

      await prisma.task.create({
        data: {
          title: t.title,
          type: t.type,
          status: "pendente",
          priority: "media",
          dueDate: due,
          assigneeId: t.type === "edicao" ? editorAssigneeId : admin.id,
          postId: post.id,
        },
      });
    }
  }

  console.log("\nPronto. 5 roteiros + posts da semana plantados.");
  console.log(
    "Distribuição: 3× Consórcio (seg, ter, qua) + 2× MSP (qui alerta, sáb bastidores)."
  );
  console.log(
    "CTA 80/20: 1 explícito (qui — lançamento MSP), 4 não-explícitos."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
