import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";

const dbPath = path.resolve(process.cwd(), "dev.db");
const db = new Database(dbPath);

function cuid() {
  return "c" + crypto.randomBytes(12).toString("hex").slice(0, 24);
}

const now = new Date().toISOString();

// Create users with hashed passwords
const adminId = cuid();
const supportId = cuid();

const adminPassword = bcrypt.hashSync("admin123", 10);
const supportPassword = bcrypt.hashSync("suporte123", 10);

db.exec("DELETE FROM Task; DELETE FROM Post; DELETE FROM Script; DELETE FROM Lead; DELETE FROM User;");

db.prepare("INSERT INTO User (id, name, cpf, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
  .run(adminId, "Eduardo Campos", "01536247529", "eduardo@onixcapital.com.br", adminPassword, "admin", now, now);

db.prepare("INSERT INTO User (id, name, cpf, email, password, role, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
  .run(supportId, "Suporte", "00000000000", "suporte@onixcapital.com.br", supportPassword, "support", now, now);

// Create templates
const templates = [
  { title: "Template - Pergunta da Semana", category: "pergunta_semana", hook: "[Pergunta provocativa sobre proteção patrimonial]", body: "Gancho: Faça a pergunta diretamente para a câmera\n\nDesenvolvimento: Explique por que essa pergunta é importante para quem tem patrimônio\n\nConclusão: Convide o público a responder nos Stories", cta: "Responda nos Stories: qual a sua dúvida?", ctaType: "identificacao" },
  { title: "Template - Onix na Prática", category: "onix_pratica", hook: "[Caso real anonimizado de um cliente]", body: "Gancho: Apresente o problema real que o cliente enfrentava\n\nDesenvolvimento: Mostre a solução aplicada e os números\n\nConclusão: Conecte com a realidade do espectador", cta: "Se identificou? Link na bio para agendar", ctaType: "implicito" },
  { title: "Template - Patrimônio sem Mimimi", category: "patrimonio_mimimi", hook: "[Mito ou conceito errado sobre finanças]", body: "Gancho: Apresente o mito que a maioria acredita\n\nDesenvolvimento: Desmonte o mito com dados e experiência\n\nConclusão: Dê a visão correta e prática", cta: "Salve esse conteúdo para consultar depois", ctaType: "identificacao" },
  { title: "Template - Alerta Patrimonial", category: "alerta_patrimonial", hook: "[Alerta urgente sobre risco patrimonial]", body: "Gancho: Comece com tom de urgência sobre um risco real\n\nDesenvolvimento: Explique o risco e quem está vulnerável\n\nConclusão: Mostre como se proteger", cta: "Compartilhe com quem precisa saber disso", ctaType: "identificacao" },
  { title: "Template - Sábado de Bastidores", category: "sabado_bastidores", hook: "[Momento pessoal ou bastidores do trabalho]", body: "Mostre um momento autêntico do seu dia a dia\n\nConecte com seus valores e motivações\n\nHumanize sua marca pessoal", cta: "", ctaType: "identificacao" },
];

const insertScript = db.prepare("INSERT INTO Script (id, title, category, hook, body, cta, ctaType, isTemplate, authorId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

for (const t of templates) {
  insertScript.run(cuid(), t.title, t.category, t.hook, t.body, t.cta, t.ctaType, 1, adminId, now, now);
}

// Create sample posts for the current week
const today = new Date();
const dow = today.getDay(); // 0=Sun
const monday = new Date(today);
monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
monday.setHours(0, 0, 0, 0);

const posts = [
  { title: "Pergunta da Semana: Você sabe quanto custa um inventário?", format: "story", category: "pergunta_semana", dayOffset: 0, time: "11:00" },
  { title: "Caso real: Como um médico protegeu R$2M em patrimônio", format: "reel", category: "onix_pratica", dayOffset: 1, time: "12:00" },
  { title: "Previdência privada é sempre um bom negócio?", format: "reel", category: "patrimonio_mimimi", dayOffset: 2, time: "12:00" },
  { title: "ALERTA: Nova regra do IR pode afetar seu patrimônio", format: "reel", category: "alerta_patrimonial", dayOffset: 3, time: "12:00" },
  { title: "Bastidores: preparando o lançamento Meu Sucesso Patrimonial", format: "story", category: "sabado_bastidores", dayOffset: 5, time: "10:00" },
];

const insertPost = db.prepare("INSERT INTO Post (id, title, format, category, status, scheduledDate, scheduledTime, ctaType, authorId, \"order\", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
const insertTask = db.prepare("INSERT INTO Task (id, title, type, status, priority, dueDate, assigneeId, postId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

for (const p of posts) {
  const date = new Date(monday);
  date.setDate(monday.getDate() + p.dayOffset);
  const isPast = p.dayOffset < (dow === 0 ? 7 : dow);
  const postId = cuid();

  insertPost.run(postId, p.title, p.format, p.category, isPast ? "publicado" : "rascunho", date.toISOString(), p.time, "identificacao", adminId, 0, now, now);

  const tasks = [
    { title: `Escrever roteiro: ${p.title}`, type: "roteiro", off: -3 },
    { title: `Gravar: ${p.title}`, type: "gravacao", off: -2 },
    { title: `Editar: ${p.title}`, type: "edicao", off: -1 },
    { title: `Publicar: ${p.title}`, type: "publicacao", off: 0 },
  ];

  for (const t of tasks) {
    const due = new Date(date);
    due.setDate(date.getDate() + t.off);
    insertTask.run(cuid(), t.title, t.type, isPast ? "concluida" : "pendente", "media", due.toISOString(), t.type === "edicao" ? supportId : adminId, postId, now, now);
  }
}

console.log("Seed completed! Created 2 users (with hashed passwords), 5 templates, 5 posts, 20 tasks.");
console.log("Login credentials (CPF + senha):");
console.log("  Admin: 015.362.475-29 / admin123");
console.log("  Suporte: 000.000.000-00 / suporte123");
db.close();
