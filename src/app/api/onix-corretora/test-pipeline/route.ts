import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config-db";
import {
  VENDEDORES_CONFIG,
  fetchConversas,
  fetchMensagens,
  filtrarConversasPorPeriodo,
  buildTranscricao,
} from "@/lib/datacrazy";

export const dynamic = "force-dynamic";

/**
 * GET /api/onix-corretora/test-pipeline?step=conversas
 * Testa cada etapa do pipeline individualmente para diagnosticar onde trava
 */
export async function GET(req: NextRequest) {
  const step = req.nextUrl.searchParams.get("step") ?? "conversas";
  const vendedor = "Eduardo Campos";
  const token = await getConfig("DATACRAZY_TOKEN");

  if (!token) {
    return NextResponse.json({ error: "DATACRAZY_TOKEN ausente" });
  }

  const config = VENDEDORES_CONFIG[vendedor];
  const start = Date.now();

  try {
    if (step === "conversas") {
      // Step 1: Fetch conversas (1 page only)
      const conversas = await fetchConversas(config.instanceIds[0], token, 1);
      return NextResponse.json({
        step: "conversas",
        ok: true,
        count: conversas.length,
        elapsed: `${Date.now() - start}ms`,
        sample: conversas.slice(0, 2).map(c => ({
          id: c.id,
          contact: c.contact?.name ?? c.contactName,
          lastMessageDate: c.lastMessageDate,
        })),
      });
    }

    if (step === "mensagens") {
      // Step 2: Fetch conversas then mensagens for top 3
      const conversas = await fetchConversas(config.instanceIds[0], token, 1);
      const inicio = new Date("2026-03-29T00:00:00Z");
      const fim = new Date("2026-04-04T23:59:59Z");
      const filtradas = filtrarConversasPorPeriodo(conversas, inicio, fim);
      const recentes = filtradas.sort((a, b) => {
        return new Date(b.lastMessageDate ?? 0).getTime() - new Date(a.lastMessageDate ?? 0).getTime();
      }).slice(0, 3);

      // Cooldown entre conversas e mensagens
      await new Promise(r => setTimeout(r, 5000));

      const results = [];
      for (const c of recentes) {
        const msgStart = Date.now();
        const msgs = await fetchMensagens(c.id, token);
        results.push({
          conversaId: c.id,
          contact: c.contact?.name,
          msgCount: msgs.length,
          elapsed: `${Date.now() - msgStart}ms`,
        });
        await new Promise(r => setTimeout(r, 5000));
      }

      return NextResponse.json({
        step: "mensagens",
        ok: true,
        conversasTotal: conversas.length,
        conversasFiltradas: filtradas.length,
        results,
        totalElapsed: `${Date.now() - start}ms`,
      });
    }

    if (step === "transcricao") {
      // Step 3: Full pipeline until transcricoes (no Claude)
      const conversas = await fetchConversas(config.instanceIds[0], token, 1);
      const inicio = new Date("2026-03-29T00:00:00Z");
      const fim = new Date("2026-04-04T23:59:59Z");
      const filtradas = filtrarConversasPorPeriodo(conversas, inicio, fim);
      const recentes = filtradas.sort((a, b) => {
        return new Date(b.lastMessageDate ?? 0).getTime() - new Date(a.lastMessageDate ?? 0).getTime();
      }).slice(0, 5);

      const transcricoes: string[] = [];
      for (const c of recentes) {
        const msgs = await fetchMensagens(c.id, token);
        if (msgs.length < 3) continue;
        const nome = c.contact?.name ?? c.contact?.pushName ?? "Contato";
        transcricoes.push(buildTranscricao(msgs, nome));
        await new Promise(r => setTimeout(r, 5000));
      }

      return NextResponse.json({
        step: "transcricao",
        ok: true,
        conversasTotal: conversas.length,
        conversasFiltradas: filtradas.length,
        transcricoes: transcricoes.length,
        totalChars: transcricoes.reduce((acc, t) => acc + t.length, 0),
        preview: transcricoes[0]?.substring(0, 300) ?? "(vazio)",
        totalElapsed: `${Date.now() - start}ms`,
      });
    }

    if (step === "1msg") {
      // Step single: fetch 1 specific conversation messages
      const conversaId = req.nextUrl.searchParams.get("id") ?? "6981f24204e6a75d458bed5a";
      const res = await fetch(
        `https://api.g1.datacrazy.io/api/v1/conversations/${conversaId}/messages?take=5&skip=0`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );
      const body = await res.text();
      return NextResponse.json({
        step: "1msg",
        httpStatus: res.status,
        bodyLen: body.length,
        bodyPreview: body.substring(0, 300),
        elapsed: `${Date.now() - start}ms`,
      });
    }

    return NextResponse.json({ error: "step invalido. Use: conversas, mensagens, transcricao, 1msg" });
  } catch (err: any) {
    return NextResponse.json({
      step,
      ok: false,
      error: err.message,
      elapsed: `${Date.now() - start}ms`,
    });
  }
}
