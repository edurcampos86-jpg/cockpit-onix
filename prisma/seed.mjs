import { PrismaClient } from "../src/generated/prisma/client.js";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "eduardo@onixcapital.com.br" },
    update: {},
    create: { name: "Eduardo Campos", email: "eduardo@onixcapital.com.br", password: "$2a$10$placeholder", role: "admin" },
  });

  const support = await prisma.user.upsert({
    where: { email: "suporte@onixcapital.com.br" },
    update: {},
    create: { name: "Suporte", email: "suporte@onixcapital.com.br", password: "$2a$10$placeholder", role: "support" },
  });

  const templates = [
    { title: "Template - Pergunta da Semana", category: "pergunta_semana", hook: "[Pergunta provocativa sobre proteção patrimonial]", body: "Gancho: Faça a pergunta diretamente para a câmera\n\nDesenvolvimento: Explique por que essa pergunta é importante\n\nConclusão: Convide o público a responder nos Stories", cta: "Responda nos Stories", ctaType: "identificacao", isTemplate: true, authorId: admin.id },
    { title: "Template - Onix na Prática", category: "onix_pratica", hook: "[Caso real anonimizado]", body: "Gancho: Apresente o problema real\n\nDesenvolvimento: Mostre a solução aplicada\n\nConclusão: Conecte com a realidade do espectador", cta: "Link na bio para agendar", ctaType: "implicito", isTemplate: true, authorId: admin.id },
    { title: "Template - Patrimônio sem Mimimi", category: "patrimonio_mimimi", hook: "[Mito sobre finanças]", body: "Gancho: Apresente o mito\n\nDesenvolvimento: Desmonte com dados\n\nConclusão: Dê a visão correta", cta: "Salve esse conteúdo", ctaType: "identificacao", isTemplate: true, authorId: admin.id },
    { title: "Template - Alerta Patrimonial", category: "alerta_patrimonial", hook: "[Alerta urgente]", body: "Gancho: Tom de urgência\n\nDesenvolvimento: Explique o risco\n\nConclusão: Mostre como se proteger", cta: "Compartilhe com quem precisa", ctaType: "identificacao", isTemplate: true, authorId: admin.id },
    { title: "Template - Sábado de Bastidores", category: "sabado_bastidores", hook: "[Momento pessoal]", body: "Mostre um momento autêntico\n\nConecte com seus valores\n\nHumanize sua marca pessoal", cta: "", ctaType: "identificacao", isTemplate: true, authorId: admin.id },
  ];

  for (const t of templates) {
    await prisma.script.create({ data: t });
  }

  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);

  const posts = [
    { title: "Pergunta da Semana: Quanto custa um inventário?", format: "story", category: "pergunta_semana", dayOffset: 0, time: "11:00" },
    { title: "Caso real: Médico protegeu R$2M em patrimônio", format: "reel", category: "onix_pratica", dayOffset: 1, time: "12:00" },
    { title: "Previdência privada é sempre bom negócio?", format: "reel", category: "patrimonio_mimimi", dayOffset: 2, time: "12:00" },
    { title: "ALERTA: Nova regra do IR e seu patrimônio", format: "reel", category: "alerta_patrimonial", dayOffset: 3, time: "12:00" },
    { title: "Bastidores: lançamento Meu Sucesso Patrimonial", format: "story", category: "sabado_bastidores", dayOffset: 5, time: "10:00" },
  ];

  for (const p of posts) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + p.dayOffset);
    const isPast = p.dayOffset < (dow === 0 ? 7 : dow);

    const post = await prisma.post.create({
      data: { title: p.title, format: p.format, category: p.category, status: isPast ? "publicado" : "rascunho", scheduledDate: date, scheduledTime: p.time, ctaType: "identificacao", authorId: admin.id },
    });

    const tasks = [
      { title: `Escrever roteiro: ${p.title}`, type: "roteiro", off: -3 },
      { title: `Gravar: ${p.title}`, type: "gravacao", off: -2 },
      { title: `Editar: ${p.title}`, type: "edicao", off: -1 },
      { title: `Publicar: ${p.title}`, type: "publicacao", off: 0 },
    ];

    for (const t of tasks) {
      const due = new Date(date);
      due.setDate(date.getDate() + t.off);
      await prisma.task.create({
        data: { title: t.title, type: t.type, status: isPast ? "concluida" : "pendente", priority: "media", dueDate: due, assigneeId: t.type === "edicao" ? support.id : admin.id, postId: post.id },
      });
    }
  }

  console.log("Seed completed!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
