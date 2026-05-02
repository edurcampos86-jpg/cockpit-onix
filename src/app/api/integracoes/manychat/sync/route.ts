import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import * as manychat from "@/lib/integrations/manychat";

/**
 * POST /api/integracoes/manychat/sync
 * Importa leads do ManyChat para o pipeline do Ecossistema
 */
export async function POST() {
  try {
    const result = await manychat.getSubscribers();
    const subscribers = result.data || [];

    // Buscar o admin para atribuir os leads
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });
    if (!admin) {
      return NextResponse.json({ error: "Nenhum admin encontrado" }, { status: 500 });
    }

    let imported = 0;
    let skipped = 0;

    for (const sub of subscribers) {
      const leadData = manychat.subscriberToLead(sub);

      // Verificar se já existe (por externalId no notes)
      const existing = await prisma.lead.findFirst({
        where: { notes: { contains: `ManyChat ID: ${sub.id}` } },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.lead.create({
        data: {
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          origin: leadData.origin,
          stage: "novo",
          temperature: leadData.temperature,
          productInterest: leadData.productInterest,
          notes: leadData.notes,
          assignedToId: admin.id,
        },
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      total: subscribers.length,
      imported,
      skipped,
      message: `${imported} leads importados, ${skipped} já existiam.`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Erro ao sincronizar" },
      { status: 500 }
    );
  }
}
