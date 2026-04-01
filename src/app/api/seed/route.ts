import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";

export async function POST() {
  try {
    // Verificar se já tem usuário admin
    const existing = await prisma.user.findFirst({ where: { role: "admin" } });
    if (existing) {
      return NextResponse.json({ message: "Seed já executado. Admin existe.", email: existing.email });
    }

    // Criar usuários
    const admin = await prisma.user.create({
      data: {
        name: "Eduardo Campos",
        cpf: "01536247529",
        email: "eduardo@onixcapital.com.br",
        password: await hash("Edu@203028", 10),
        role: "admin",
      },
    });

    await prisma.user.create({
      data: {
        name: "Suporte",
        cpf: "00000000000",
        email: "suporte@onixcapital.com.br",
        password: await hash("suporte123", 10),
        role: "support",
      },
    });

    // Criar templates
    const templates = [
      { title: "Template - Pergunta da Semana", category: "pergunta_semana", hook: "[Pergunta provocativa sobre proteção patrimonial]", body: "Gancho: Faça a pergunta diretamente para a câmera\n\nDesenvolvimento: Explique por que essa pergunta é importante\n\nConclusão: Convide o público a responder nos Stories", cta: "Responda nos Stories", ctaType: "identificacao" },
      { title: "Template - Onix na Prática", category: "onix_pratica", hook: "[Caso real anonimizado]", body: "Gancho: Apresente o problema real\n\nDesenvolvimento: Mostre a solução e os números\n\nConclusão: Conecte com a realidade do espectador", cta: "Link na bio para agendar", ctaType: "implicito" },
      { title: "Template - Patrimônio sem Mimimi", category: "patrimonio_mimimi", hook: "[Mito financeiro]", body: "Gancho: Apresente o mito\n\nDesenvolvimento: Desmonte com dados\n\nConclusão: Visão correta e prática", cta: "Salve esse conteúdo", ctaType: "identificacao" },
      { title: "Template - Alerta Patrimonial", category: "alerta_patrimonial", hook: "[Alerta urgente]", body: "Gancho: Tom de urgência\n\nDesenvolvimento: Explique o risco\n\nConclusão: Como se proteger", cta: "Compartilhe com quem precisa", ctaType: "identificacao" },
      { title: "Template - Sábado de Bastidores", category: "sabado_bastidores", hook: "[Momento pessoal]", body: "Mostre um momento autêntico\n\nConecte com seus valores\n\nHumanize sua marca", cta: "", ctaType: "identificacao" },
    ];

    for (const t of templates) {
      await prisma.script.create({ data: { ...t, isTemplate: true, authorId: admin.id } });
    }

    return NextResponse.json({
      success: true,
      message: "Seed executado com sucesso!",
      login: { cpf: "015.362.475-29", senha: "Edu@203028" },
    });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
