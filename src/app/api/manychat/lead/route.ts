import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getConfig } from "@/lib/config-db";
import { sendWhatsappMessage } from "@/lib/integrations/datacrazy-send";
import { manychatLeadAlertHabilitado } from "@/lib/manychat-lead/flag";
import {
  montarAvisoLead,
  normalizarUsername,
  parseLeadManyChat,
  temConteudo,
} from "@/lib/manychat-lead/mensagem";

/**
 * POST /api/manychat/lead
 *
 * Recebe do ManyChat o aviso de que alguém escreveu uma palavra-gatilho na DM
 * do Instagram e manda um WhatsApp para o Eduardo. Configuração do lado do
 * ManyChat (URL, headers, corpo): `docs/manychat-lead-webhook.md`.
 *
 * ── O que esta rota NÃO faz ──
 * Não grava nada. Nem lead, nem log em tabela — só `console`. O funil de leads
 * (`/leads`) e o import por `/api/integracoes/manychat/sync` continuam sendo o
 * caminho de persistência; misturar as duas coisas aqui trocaria "aviso que
 * chega em 2 segundos" por "aviso que depende do banco estar de pé". Persistir
 * o lead é decisão separada, e portanto PR separada.
 *
 * ── Canal ──
 * Reusa `sendWhatsappMessage` (Z-API), o mesmo cliente dos alertas de cadência
 * 12-4-2. Sem `phoneOverride`: o destino é o `DATACRAZY_ALERTS_PHONE` já
 * configurado, o mesmo número que recebe os alertas de operação. Nenhum
 * segredo novo, nenhuma instância nova.
 *
 * ── Respostas ──
 *   401 sem corpo  — header `X-Onix-Secret` ausente ou errado, ou o segredo
 *                    não está configurado no ambiente (fecha, não abre).
 *   400            — corpo não é JSON, ou os quatro campos do lead vieram
 *                    vazios (não há o que avisar).
 *   200            — aviso enviado, ou flag desligada.
 *   502            — a Z-API recusou o envio. Corpo e header estavam certos, o
 *                    canal é que falhou: devolver 200 aqui esconderia a queda
 *                    do WhatsApp atrás de um "Success" verde no painel do
 *                    ManyChat, e o aviso perdido não aparece em lugar nenhum.
 */
export const dynamic = "force-dynamic";

/**
 * Comparação em tempo constante.
 *
 * `===` sai no primeiro byte diferente. É diferença pequena e ruidosa para
 * medir pela rede, mas o custo de não ter isto é zero a favor de quem tenta
 * adivinhar o segredo — e este endpoint é público por definição.
 */
function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  // ── Auth ───────────────────────────────────────────────────────────
  //
  // Antes da flag, de propósito: segredo errado responde 401 esteja o aviso
  // ligado ou desligado. Do contrário, a resposta denunciaria o estado da flag
  // para quem nem tem o segredo.
  //
  // Segredo AUSENTE também é 401 — o oposto do que a rota do DataCrazy faz
  // (lá, sem segredo configurado, tudo passa). Aqui não: esta rota dispara
  // WhatsApp, e um endpoint aberto vira gerador de spam no celular do Eduardo
  // no minuto em que a URL vazar num print do painel do ManyChat.
  const esperado = await getConfig("MANYCHAT_WEBHOOK_SECRET");
  const recebido = req.headers.get("x-onix-secret") ?? "";
  if (!esperado || !recebido || !segredoConfere(recebido, esperado)) {
    console.warn(
      `[manychat-lead] 401 — segredo ${esperado ? (recebido ? "incorreto" : "ausente no header") : "não configurado no ambiente"}`,
    );
    return new NextResponse(null, { status: 401 });
  }

  // ── Parse ──────────────────────────────────────────────────────────
  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    console.warn("[manychat-lead] 400 — corpo não é JSON");
    return NextResponse.json({ ok: false, motivo: "corpo inválido" }, { status: 400 });
  }

  const lead = parseLeadManyChat(bruto);
  if (!temConteudo(lead)) {
    console.warn("[manychat-lead] 400 — nenhum campo do lead preenchido");
    return NextResponse.json({ ok: false, motivo: "payload vazio" }, { status: 400 });
  }

  // Identidade do lead para o log. O TEXTO da DM fica de fora: ele é conteúdo
  // de conversa privada e o log do Railway é retido e lido por ferramenta
  // externa. O @ do Instagram é público e é o que permite achar a pessoa.
  const quem = `@${normalizarUsername(lead.username_instagram) || "?"} / ${lead.palavra_gatilho || "?"}`;

  // ── Flag ───────────────────────────────────────────────────────────
  //
  // 200 com `enviado: false`, não 4xx: o ManyChat marca o External Request como
  // quebrado depois de algumas respostas de erro, e aí religar a flag não
  // bastaria — alguém teria de reabrir o fluxo no painel para reativar o passo.
  if (!(await manychatLeadAlertHabilitado())) {
    console.info(`[manychat-lead] ignorado (flag MANYCHAT_LEAD_ALERT desligada) — ${quem}`);
    return NextResponse.json({ ok: true, enviado: false, motivo: "flag desligada" });
  }

  // ── Envio ──────────────────────────────────────────────────────────
  const ok = await sendWhatsappMessage(montarAvisoLead(lead));

  if (!ok) {
    console.error(`[manychat-lead] falha no envio via Z-API — ${quem}`);
    return NextResponse.json({ ok: false, enviado: false, motivo: "envio falhou" }, { status: 502 });
  }

  console.info(`[manychat-lead] aviso enviado — ${quem}`);
  return NextResponse.json({ ok: true, enviado: true });
}
