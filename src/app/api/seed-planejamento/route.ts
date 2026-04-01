import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const PLAN = [
  // Semana atual: 30 Mar - 05 Abr — Tema: "Introdução — Por que blindagem patrimonial?"
  { day: "2026-03-30", title: "Caixinha: O que te preocupa mais — ganhar ou proteger dinheiro?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-03-31", title: "Caso Real: Empresário que perdeu 40% do patrimônio no divórcio", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-04-01", title: "Carrossel: O que é blindagem patrimonial e por que você precisa", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-02", title: "Alerta: 3 riscos que ameaçam seu patrimônio agora mesmo", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-04", title: "Bastidores: Como nasceu a Onix Capital — minha história", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },
];

export async function POST() {
  try {
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!admin) return NextResponse.json({ error: "Admin not found" }, { status: 404 });
    const support = await prisma.user.findFirst({ where: { role: "support" } });

    let created = 0;
    for (const p of PLAN) {
      const scheduledDate = new Date(p.day + "T" + p.time + ":00");
      const dayStart = new Date(p.day + "T00:00:00");
      const dayEnd = new Date(p.day + "T23:59:59");
      const existing = await prisma.post.findFirst({
        where: { category: p.category, scheduledDate: { gte: dayStart, lte: dayEnd } },
      });
      if (existing) continue;

      const post = await prisma.post.create({
        data: {
          title: p.title, format: p.format, category: p.category,
          ctaType: p.ctaType, status: "rascunho",
          scheduledDate, scheduledTime: p.time, authorId: admin.id,
        },
      });

      const taskDefs = [
        { title: `Escrever roteiro: ${p.title}`, type: "roteiro", dayOffset: -3 },
        { title: `Gravar: ${p.title}`, type: "gravacao", dayOffset: -2 },
        { title: `Editar: ${p.title}`, type: "edicao", dayOffset: -1 },
        { title: `Publicar: ${p.title}`, type: "publicacao", dayOffset: 0 },
      ];
      for (const t of taskDefs) {
        const dueDate = new Date(scheduledDate);
        dueDate.setDate(scheduledDate.getDate() + t.dayOffset);
        await prisma.task.create({
          data: {
            title: t.title, type: t.type, status: "pendente", priority: "media",
            dueDate, assigneeId: t.type === "edicao" ? (support?.id || admin.id) : admin.id,
            postId: post.id,
          },
        });
      }
      created++;
    }

    return NextResponse.json({ success: true, created, total: PLAN.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
