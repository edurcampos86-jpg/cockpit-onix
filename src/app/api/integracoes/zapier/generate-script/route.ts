import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { validateWebhookSecret } from "@/lib/integrations/zapier";
import { generateScriptForPost } from "@/lib/integrations/claude-ai";

/**
 * POST /api/integracoes/zapier/generate-script
 * Flow B: Zapier chama este endpoint para gerar um roteiro via Claude AI
 *
 * === CONFIGURAÇÃO NO ZAPIER ===
 * 1. Trigger: qualquer evento (novo item no Google Sheets, novo evento de calendário,
 *    nova mensagem no ManyChat, Plaud.ai, etc.)
 * 2. Action: Webhooks by Zapier > POST
 * 3. URL: https://SEU-DOMINIO/api/integracoes/zapier/generate-script
 * 4. Headers:
 *    - Content-Type: application/json
 *    - x-webhook-secret: (valor do ZAPIER_WEBHOOK_SECRET no seu .env)
 * 5. Body (JSON):
 *    {
 *      "title": "Título do post ou tema",
 *      "category": "onix_pratica" | "alerta_patrimonial" | "patrimonio_mimimi" | "pergunta_semana" | "sabado_bastidores",
 *      "format": "reel" | "carrossel" | "story",
 *      "topic": "contexto adicional (opcional)",
 *      "authorId": "ID do usuário no Cockpit (opcional — usa admin se omitido)",
 *      "scheduledDate": "2026-04-01" (opcional — agendamento automático)
 *    }
 *
 * === RESPOSTA ===
 * {
 *   "success": true,
 *   "scriptId": "...",
 *   "postId": "..." (se scheduledDate foi fornecida),
 *   "script": { hook, body, cta, ctaType, estimatedTime, hashtags }
 * }
 */
export async function POST(request: NextRequest) {
  // Validar webhook secret
  const secret = request.headers.get("x-webhook-secret") || "";
  const isValid = await validateWebhookSecret(secret);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, category, format, topic, authorId, scheduledDate, scheduledTime } = body;

    // Validação básica
    if (!title || !category) {
      return NextResponse.json(
        { error: "Campos obrigatórios: title, category" },
        { status: 400 }
      );
    }

    const validCategories = ["onix_pratica", "alerta_patrimonial", "patrimonio_mimimi", "pergunta_semana", "sabado_bastidores"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: `Categoria inválida. Use: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    // Resolver authorId — usar admin se não fornecido
    let resolvedAuthorId = authorId;
    if (!resolvedAuthorId) {
      const admin = await prisma.user.findFirst({ where: { role: "admin" } });
      if (!admin) {
        return NextResponse.json({ error: "Nenhum usuário admin encontrado" }, { status: 500 });
      }
      resolvedAuthorId = admin.id;
    }

    // Gerar roteiro com Claude AI
    const scriptData = await generateScriptForPost({
      title,
      category,
      format: format || "reel",
      topic: topic || undefined,
    });

    // Salvar roteiro no banco
    const script = await prisma.script.create({
      data: {
        title,
        category,
        hook: scriptData.hook,
        body: scriptData.body,
        cta: scriptData.cta,
        ctaType: scriptData.ctaType,
        estimatedTime: scriptData.estimatedTime,
        hashtags: scriptData.hashtags,
        isTemplate: false,
        authorId: resolvedAuthorId,
      },
    });

    // Se scheduledDate fornecida, criar post automaticamente vinculado ao roteiro
    let postId: string | null = null;
    if (scheduledDate) {
      const time = scheduledTime || "12:00";
      const post = await prisma.post.create({
        data: {
          title,
          format: format || "reel",
          category,
          ctaType: scriptData.ctaType,
          scheduledDate: new Date(`${scheduledDate}T${time}:00`),
          scheduledTime: time,
          status: "rascunho",
          hashtags: scriptData.hashtags,
          authorId: resolvedAuthorId,
          scriptId: script.id,
        },
      });
      postId = post.id;

      // Criar tarefas do pipeline para o post
      const pubDate = new Date(post.scheduledDate);
      const tasks = [
        { title: `Gravar: ${title}`, type: "gravacao", dayOffset: -2 },
        { title: `Editar: ${title}`, type: "edicao", dayOffset: -1 },
        { title: `Publicar: ${title}`, type: "publicacao", dayOffset: 0 },
      ].map((def) => {
        const dueDate = new Date(pubDate);
        dueDate.setDate(pubDate.getDate() + def.dayOffset);
        return {
          title: def.title,
          type: def.type,
          status: "pendente",
          priority: "media" as const,
          dueDate,
          assigneeId: resolvedAuthorId,
          postId: post.id,
        };
      });
      await prisma.task.createMany({ data: tasks });
    }

    return NextResponse.json({
      success: true,
      scriptId: script.id,
      postId,
      script: {
        hook: script.hook,
        body: script.body,
        cta: script.cta,
        ctaType: script.ctaType,
        estimatedTime: script.estimatedTime,
        hashtags: script.hashtags,
      },
      message: postId
        ? `Roteiro gerado e post agendado para ${scheduledDate}`
        : "Roteiro gerado e salvo no Cockpit",
    }, { status: 201 });

  } catch (error) {
    console.error("Erro ao gerar roteiro via Zapier:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/integracoes/zapier/generate-script
 * Endpoint de verificação — o Zapier usa para testar a conexão
 */
export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Cockpit Onix — Geração de Roteiros via IA",
    version: "v4",
    accepts: "POST com JSON: { title, category, format, topic?, authorId?, scheduledDate? }",
    categories: ["onix_pratica", "alerta_patrimonial", "patrimonio_mimimi", "pergunta_semana", "sabado_bastidores"],
    formats: ["reel", "carrossel", "story"],
    authentication: "Header: x-webhook-secret",
  });
}
