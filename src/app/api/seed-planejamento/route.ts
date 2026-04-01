import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// Endpoint temporário para popular o planejamento de 60 dias
// REMOVER após uso

const PLAN: { day: string; title: string; format: string; category: string; ctaType: string; time: string }[] = [
  // Semana 1: 06-12 Abr — Diagnóstico Patrimonial
  { day: "2026-04-06", title: "Caixinha: Você sabe quanto paga de imposto?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-04-07", title: "Caso Real: Médico que pagava R$180k/ano de imposto sem saber", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-04-08", title: "Carrossel: 5 sinais que você paga caro nos investimentos", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-09", title: "Alerta: ITCMD na Bahia — simulação com números reais", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-11", title: "Bastidores: Meu ritual de domingo — como planejo a semana", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 2: 13-19 Abr — PJ Médica
  { day: "2026-04-13", title: "Caixinha: Pró-labore vs. distribuição — qual a diferença?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-04-14", title: "Caso Real: Médica PJ que economizou R$72k/ano reorganizando", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-04-15", title: "Carrossel: Pró-labore vs. Distribuição — comparativo para médicos", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-16", title: "Alerta: A ilusão da segurança na renda fixa", format: "reel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-18", title: "Bastidores: Por que escolhi trabalhar com médicos", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 3: 20-26 Abr — Proteção Familiar
  { day: "2026-04-20", title: "Caixinha: Sua família sabe o que fazer se você faltar?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-04-21", title: "Caso Real: Família que perdeu R$2MM por falta de planejamento", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-04-22", title: "Carrossel: Ranking dos 3 seguros essenciais para alta renda", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-23", title: "Alerta: O que acontece com seu patrimônio sem testamento", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-25", title: "Bastidores: O que aprendi viajando com minha família", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 4: 27 Abr - 03 Mai — Bucket Strategy
  { day: "2026-04-27", title: "Caixinha: Sua reserva de emergência é real?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-04-28", title: "Caso Real: Cirurgião com R$60k/mês e zero liquidez", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-04-29", title: "Carrossel: Checklist de emergência financeira — 7 itens", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-04-30", title: "Alerta: Quanto você perde deixando dinheiro no banco tradicional", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-02", title: "Bastidores: 19 anos de carreira — o que me mantém motivado", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 5: 04-10 Mai — Imóveis
  { day: "2026-05-04", title: "Caixinha: Como você comprou (ou pretende comprar) seu imóvel?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-05-05", title: "Caso Real: Médico que economizou R$400k no imóvel", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-05-06", title: "Carrossel: Financiamento vs. Consórcio vs. À Vista", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-07", title: "Alerta: O custo real do financiamento que ninguém te conta", format: "reel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-09", title: "Bastidores: Dia das Mães — o legado que quero deixar", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 6: 11-17 Mai — Holding Familiar
  { day: "2026-05-11", title: "Caixinha: Você já pensou em criar uma holding familiar?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-05-12", title: "Caso Real: Casal que economizou R$350k com holding familiar", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-05-13", title: "Carrossel: Holding familiar — quando vale e quando NÃO vale", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-14", title: "Alerta: Reforma tributária e impacto na sucessão patrimonial", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-16", title: "Bastidores: O melhor conselho financeiro que já recebi", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 7: 18-24 Mai — Previdência
  { day: "2026-05-18", title: "Caixinha: Você tem previdência? Sabe quanto paga de taxa?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-05-19", title: "Caso Real: Troca de previdência que gerou R$200k em 10 anos", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-05-20", title: "Carrossel: PGBL vs. VGBL — qual escolher e por quê", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-21", title: "Alerta: Taxas escondidas que corroem sua previdência", format: "reel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-23", title: "Bastidores: Minha rotina matinal — disciplina é liberdade", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },

  // Semana 8: 25-31 Mai — Método Onix
  { day: "2026-05-25", title: "Caixinha: Quantas 'portas' do seu patrimônio estão protegidas?", format: "story", category: "pergunta_semana", ctaType: "implicito", time: "11:00" },
  { day: "2026-05-26", title: "Caso Real: Médico que reorganizou tudo em 90 dias — Método Onix", format: "reel", category: "onix_pratica", ctaType: "explicito", time: "12:00" },
  { day: "2026-05-27", title: "Carrossel: Os 4 pilares do Método Onix — blindagem 360°", format: "carrossel", category: "patrimonio_mimimi", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-28", title: "Alerta: 70% dos patrimônios familiares desaparecem em 2 gerações", format: "carrossel", category: "alerta_patrimonial", ctaType: "algoritmo", time: "12:00" },
  { day: "2026-05-30", title: "Bastidores: Retrospectiva de 2 meses — o que mudou no perfil", format: "reel", category: "sabado_bastidores", ctaType: "identificacao", time: "10:00" },
];

export async function POST() {
  try {
    // Buscar admin user
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!admin) {
      return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
    }

    const support = await prisma.user.findFirst({ where: { role: "support" } });

    let created = 0;
    let skipped = 0;

    for (const p of PLAN) {
      const scheduledDate = new Date(p.day + "T" + p.time + ":00");

      // Verificar se já existe post nessa data com essa categoria
      const dayStart = new Date(p.day + "T00:00:00");
      const dayEnd = new Date(p.day + "T23:59:59");
      const existing = await prisma.post.findFirst({
        where: {
          category: p.category,
          scheduledDate: { gte: dayStart, lte: dayEnd },
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      const post = await prisma.post.create({
        data: {
          title: p.title,
          format: p.format,
          category: p.category,
          ctaType: p.ctaType,
          status: "rascunho",
          scheduledDate,
          scheduledTime: p.time,
          authorId: admin.id,
        },
      });

      // Criar tarefas do pipeline
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
            title: t.title,
            type: t.type,
            status: "pendente",
            priority: "media",
            dueDate,
            assigneeId: t.type === "edicao" ? (support?.id || admin.id) : admin.id,
            postId: post.id,
          },
        });
      }

      created++;
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      total: PLAN.length,
      message: `Planejamento de 60 dias criado. ${created} posts criados, ${skipped} já existiam.`,
    });
  } catch (error) {
    console.error("Erro ao criar planejamento:", error);
    return NextResponse.json({ error: "Erro ao criar planejamento" }, { status: 500 });
  }
}
