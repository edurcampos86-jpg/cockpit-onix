import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import { sendSlackMessage } from "@/lib/integrations/slack";
import { diasCadencia } from "@/lib/cadencia";
import { riscoEvasaoReuniao } from "@/lib/cadencia-core";
import { sendWhatsappMessage } from "@/lib/integrations/datacrazy-send";
import {
  decidirAlertaCliente,
  chaveAlerta,
  LABEL_GATILHO,
  type Gatilho,
  type EstadoAlerta,
} from "@/lib/alertas-cliente-core";

/**
 * Alertas proativos de relacionamento (Entrega C — Fase 3). Cron diário que
 * dispara no Slack quando um cliente A/B cruza um gatilho. Dedupe por
 * (gatilho, cliente) via AlertaClienteLog, reenvio no máx 1x/semana.
 *
 * Gatilhos (limiares em Config/env, ajustáveis sem deploy):
 *   1. saldo_parado       — saldoConta > ALERTA_SALDO_PARADO_MIN (R$100k) e
 *      SEM movimento de aplicação nos últimos ALERTA_SALDO_SEM_APLICACAO_DIAS.
 *   2. rf_vencendo        — renda fixa vencendo nos próximos
 *      ALERTA_RF_VENCIMENTO_DIAS dias. DORMENTE: depende de vencimento por
 *      ativo, que a API BTG ainda não entrega (getPartnerPositions vazio) e o
 *      arquivo não traz. Ativa sozinho quando breakdownProdutos tiver datas.
 *   3. termometro_vermelho — cliente classe A "vermelho" no termômetro
 *      (dias sem contato > cadência A = 30d).
 *
 * Só avalia clientes classe A e B ativos.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

async function numConfig(key: string, fallback: number): Promise<number> {
  const raw = await getConfig(key);
  if (!raw) return fallback;
  const n = parseFloat(raw.replace(",", "."));
  return isNaN(n) ? fallback : n;
}

function baseUrl(): string {
  const explicit = process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return "";
}

function moeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface ClienteAlvo {
  id: string;
  nome: string;
  numeroConta: string;
  classificacao: string;
  saldoConta: number;
  ultimoContatoAt: Date | null;
  breakdownProdutos: unknown;
}

interface Disparo {
  gatilho: Gatilho;
  cliente: ClienteAlvo;
  detalhe: string; // linha descritiva pra mensagem
  valor: string; // snapshot do valor (BtgSyncLog/ultimoValor)
}

// ── Detecção de "aplicação" recente (gatilho 1) ──────────────────────────
// Aplicação = aporte/aplicação em produto. tipo BTG ex: "APLICAÇÃO",
// "DEPÓSITO DE CUSTÓDIA". Olhamos tipo + descrição, case-insensitive.
async function contasComAplicacaoRecente(clienteIds: string[], desde: Date): Promise<Set<string>> {
  const comAplicacao = new Set<string>();
  if (clienteIds.length === 0) return comAplicacao;
  const movs = await prisma.movimentacaoBtg.findMany({
    where: {
      clienteId: { in: clienteIds },
      data: { gte: desde },
      OR: [
        { tipo: { contains: "APLICA", mode: "insensitive" } },
        { tipo: { contains: "APORTE", mode: "insensitive" } },
        { descricao: { contains: "aplica", mode: "insensitive" } },
        { descricao: { contains: "aporte", mode: "insensitive" } },
      ],
    },
    select: { clienteId: true },
  });
  for (const m of movs) comAplicacao.add(m.clienteId);
  return comAplicacao;
}

// ── Renda fixa vencendo (gatilho 2 — dormente) ───────────────────────────
// Varre breakdownProdutos procurando ativos de renda fixa com data de
// vencimento dentro da janela. Hoje breakdownProdutos vem vazio (a API não
// entrega posição), então retorna []. Quando o dado existir, ativa sozinho.
function rfVencendo(breakdown: unknown, dias: number, agora: number): Array<{ ativo: string; valor: number | null; emDias: number }> {
  const out: Array<{ ativo: string; valor: number | null; emDias: number }> = [];
  if (!breakdown || typeof breakdown !== "object") return out;
  const limite = agora + dias * MS_DIA;
  // Procura arrays de produtos em chaves prováveis.
  const obj = breakdown as Record<string, unknown>;
  const arrays: unknown[] = [];
  for (const k of ["rendaFixa", "fixedIncome", "products", "positions", "items", "ativos", "assets"]) {
    if (Array.isArray(obj[k])) arrays.push(...(obj[k] as unknown[]));
  }
  if (Array.isArray(breakdown)) arrays.push(...(breakdown as unknown[]));
  for (const item of arrays) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    let vencStr: string | null = null;
    for (const k of ["vencimento", "maturityDate", "maturity", "dueDate", "expirationDate", "dataVencimento"]) {
      const v = p[k];
      if (typeof v === "string" && v) { vencStr = v; break; }
    }
    if (!vencStr) continue;
    const t = new Date(vencStr).getTime();
    if (isNaN(t) || t < agora || t > limite) continue;
    let ativo = "Renda fixa";
    for (const k of ["ativo", "asset", "productName", "name", "nome"]) {
      const v = p[k];
      if (typeof v === "string" && v) { ativo = v; break; }
    }
    let valor: number | null = null;
    for (const k of ["valor", "value", "grossValue", "amount", "saldo"]) {
      const v = p[k];
      if (typeof v === "number") { valor = v; break; }
    }
    out.push({ ativo, valor, emDias: Math.max(0, Math.round((t - agora) / MS_DIA)) });
  }
  return out;
}

export interface ResultadoAlertasClientes {
  ok: boolean;
  logId: string;
  avaliados: number;
  disparandoPorGatilho: Record<Gatilho, number>;
  enviados: number;
  resolvidos: number;
  rfDormente: boolean;
  erros: Array<{ etapa: string; motivo: string }>;
  durationMs: number;
  message: string;
}

export async function avaliarAlertasClientes(opts: {
  trigger: "manual" | "cron";
}): Promise<ResultadoAlertasClientes> {
  const start = Date.now();
  const agora = new Date();
  const log = await prisma.btgSyncLog.create({
    data: { tipo: "alertas-clientes", trigger: opts.trigger, resumo: "avaliando gatilhos A/B" },
  });

  const erros: Array<{ etapa: string; motivo: string }> = [];
  const disparandoPorGatilho: Record<Gatilho, number> = {
    saldo_parado: 0,
    rf_vencendo: 0,
    termometro_vermelho: 0,
    risco_evasao: 0,
  };
  let enviados = 0;
  let resolvidos = 0;

  const saldoMin = await numConfig("ALERTA_SALDO_PARADO_MIN", 100_000);
  const semAplicacaoDias = await numConfig("ALERTA_SALDO_SEM_APLICACAO_DIAS", 30);
  const rfDias = await numConfig("ALERTA_RF_VENCIMENTO_DIAS", 30);
  const cadenciaA = diasCadencia("A");

  const clientes: ClienteAlvo[] = await prisma.clienteBackoffice.findMany({
    where: {
      classificacao: { in: ["A", "B"] },
      OR: [{ ativacaoConta: "Ativa" }, { ativacaoConta: null }],
    },
    select: {
      id: true,
      nome: true,
      numeroConta: true,
      classificacao: true,
      saldoConta: true,
      ultimoContatoAt: true,
      breakdownProdutos: true,
    },
  });

  // ── Monta o conjunto de disparos ───────────────────────────────────────
  const disparos: Disparo[] = [];

  // Gatilho 1: saldo parado
  const candSaldo = clientes.filter((c) => c.saldoConta > saldoMin);
  const desdeAplicacao = new Date(agora.getTime() - semAplicacaoDias * MS_DIA);
  let comAplicacao = new Set<string>();
  try {
    comAplicacao = await contasComAplicacaoRecente(candSaldo.map((c) => c.id), desdeAplicacao);
  } catch (e) {
    erros.push({ etapa: "contasComAplicacaoRecente", motivo: e instanceof Error ? e.message : "?" });
  }
  for (const c of candSaldo) {
    if (comAplicacao.has(c.id)) continue;
    disparos.push({
      gatilho: "saldo_parado",
      cliente: c,
      detalhe: `Saldo em conta: ${moeda(c.saldoConta)} — parado há +${semAplicacaoDias}d sem aplicação`,
      valor: moeda(c.saldoConta),
    });
  }

  // Gatilho 3: termômetro vermelho (só classe A)
  for (const c of clientes) {
    if (c.classificacao.toUpperCase() !== "A" || !c.ultimoContatoAt) continue;
    const dias = Math.floor((agora.getTime() - c.ultimoContatoAt.getTime()) / MS_DIA);
    if (dias <= cadenciaA) continue; // vermelho = estourou a cadência (>100%)
    disparos.push({
      gatilho: "termometro_vermelho",
      cliente: c,
      detalhe: `Sem contato há ${dias} dias (cadência A: ${cadenciaA}d)`,
      valor: `${dias}d`,
    });
  }

  // Gatilho 2: renda fixa vencendo (dormente até haver dado de vencimento)
  let rfDormente = true;
  for (const c of clientes) {
    const vencs = rfVencendo(c.breakdownProdutos, rfDias, agora.getTime());
    if (vencs.length > 0) rfDormente = false;
    for (const v of vencs) {
      disparos.push({
        gatilho: "rf_vencendo",
        cliente: c,
        detalhe: `${v.ativo}${v.valor != null ? ` (${moeda(v.valor)})` : ""} vence em ${v.emDias}d`,
        valor: v.valor != null ? moeda(v.valor) : v.ativo,
      });
    }
  }

  // Gatilho 4: risco de evasão — sem reunião AGENDADA dentro do teto da classe.
  //
  // Query PRÓPRIA, e não o `clientes` acima, por dois motivos:
  //  - aquele conjunto é restrito a A e B, e esta regra vale para C também
  //    (teto de 180 dias); incluir C lá dentro mudaria o candidato dos outros
  //    três gatilhos, que não é o que se quer;
  //  - precisa de campos que os outros não usam (datas de reunião e o teto
  //    manual), e carregá-los para todo mundo seria desperdício.
  //
  // Só `risco` alerta. `atencao` (prazo se aproximando, ou reunião marcada
  // fora do teto) fica visível na tabela de clientes, mas não vira mensagem —
  // alerta que dispara antes de ser acionável vira ruído e some do radar.
  try {
    const paraEvasao = await prisma.clienteBackoffice.findMany({
      where: {
        classificacao: { in: ["A", "B", "C"] },
        OR: [{ ativacaoConta: "Ativa" }, { ativacaoConta: null }],
      },
      select: {
        id: true,
        nome: true,
        numeroConta: true,
        classificacao: true,
        saldoConta: true,
        ultimoContatoAt: true,
        ultimaReuniaoAt: true,
        proximaReuniaoAt: true,
        cadenciaReuniaoDiasOverride: true,
      },
    });

    for (const c of paraEvasao) {
      const r = riscoEvasaoReuniao(
        c.classificacao,
        c.ultimaReuniaoAt,
        c.proximaReuniaoAt,
        c.cadenciaReuniaoDiasOverride,
        agora.getTime(),
      );
      if (r.status !== "risco") continue;
      const vencidaHa = Math.abs(r.diasAteLimite);
      disparos.push({
        gatilho: "risco_evasao",
        cliente: { ...c, breakdownProdutos: null },
        detalhe:
          `Sem reunião agendada — teto de ${r.cadencia}d` +
          (r.override ? " (manual)" : ` (classe ${c.classificacao})`) +
          ` venceu há ${vencidaHa}d`,
        valor: `${vencidaHa}d vencida`,
      });
    }
  } catch (e) {
    erros.push({
      etapa: "risco_evasao",
      motivo: e instanceof Error ? e.message : "?",
    });
  }

  for (const d of disparos) disparandoPorGatilho[d.gatilho]++;

  // ── Reconcilia com o estado persistido (dedupe + reenvio + resolução) ──
  const firingMap = new Map<string, Disparo>();
  for (const d of disparos) firingMap.set(chaveAlerta(d.gatilho, d.cliente.id), d);

  const rows = await prisma.alertaClienteLog.findMany();
  const rowByChave = new Map(rows.map((r) => [r.chave, r]));
  const link = baseUrl();

  // Destinatários de WhatsApp do alerta de evasão. Vêm de Config
  // (ALERTA_EVASAO_EMAILS, e-mails separados por vírgula) e não de nomes no
  // código: quem recebe alerta de carteira muda com a equipe, e trocar isso
  // não pode exigir deploy. O telefone sai do cadastro em Pessoa — uma fonte
  // só, já mantida no /time.
  //
  // Sem a config, nenhum WhatsApp é enviado e o Slack segue normal: o alerta
  // não deixa de existir por falta de configuração, só perde um canal.
  let telefonesEvasao: Array<{ nome: string; telefone: string }> = [];
  if (disparandoPorGatilho.risco_evasao > 0) {
    try {
      const emails = (await getConfig("ALERTA_EVASAO_EMAILS")) ?? "";
      const lista = emails
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"));
      if (lista.length > 0) {
        const pessoas = await prisma.pessoa.findMany({
          where: { email: { in: lista } },
          select: { nomeCompleto: true, telefone: true },
        });
        telefonesEvasao = pessoas
          .filter((p): p is { nomeCompleto: string; telefone: string } => !!p.telefone)
          .map((p) => ({ nome: p.nomeCompleto, telefone: p.telefone }));
        const semTelefone = pessoas.length - telefonesEvasao.length;
        if (semTelefone > 0) {
          erros.push({
            etapa: "whatsapp-evasao",
            motivo: `${semTelefone} destinatário(s) sem telefone cadastrado em Pessoa`,
          });
        }
        const naoEncontrados = lista.length - pessoas.length;
        if (naoEncontrados > 0) {
          erros.push({
            etapa: "whatsapp-evasao",
            motivo: `${naoEncontrados} e-mail(s) de ALERTA_EVASAO_EMAILS sem Pessoa correspondente`,
          });
        }
      }
    } catch (e) {
      erros.push({
        etapa: "whatsapp-evasao",
        motivo: e instanceof Error ? e.message : "?",
      });
    }
  }

  // Disparando agora → decide e (talvez) envia
  for (const [chave, d] of firingMap) {
    const row = rowByChave.get(chave);
    const prev: EstadoAlerta = row
      ? { ativo: row.status === "ativo", alertadoEm: row.alertadoEm, statusDesde: row.statusDesde }
      : { ativo: false, alertadoEm: null, statusDesde: null };
    const { acao, estado } = decidirAlertaCliente(prev, true, agora);

    if (acao === "novo" || acao === "reenvio") {
      const c = d.cliente;
      const url = link ? `${link}/empresas/investimentos/clientes/${c.id}` : `/empresas/investimentos/clientes/${c.id}`;
      const lembrete = acao === "reenvio" ? " _(lembrete semanal)_" : "";
      const msg =
        `:rotating_light: *${LABEL_GATILHO[d.gatilho]}*${lembrete} — ${c.nome} ` +
        `(classe ${c.classificacao}, conta ${c.numeroConta})\n` +
        `${d.detalhe}\n${url}`;
      try {
        const enviado = await sendSlackMessage(msg);
        if (enviado) enviados++;
        else erros.push({ etapa: "slack", motivo: "webhook não configurado/falhou" });
      } catch (e) {
        erros.push({ etapa: "slack", motivo: e instanceof Error ? e.message : "?" });
      }

      // WhatsApp individual — só para risco de evasão. Os outros gatilhos
      // seguem só no Slack, como antes: mandar todos no WhatsApp de três
      // pessoas transformaria o canal em ruído e o alerta grave se perderia
      // no meio.
      if (d.gatilho === "risco_evasao") {
        const texto =
          `🚨 *${LABEL_GATILHO[d.gatilho]}*${lembrete}\n` +
          `${c.nome} (classe ${c.classificacao}, conta ${c.numeroConta})\n` +
          `${d.detalhe}\n${url}`;
        for (const dest of telefonesEvasao) {
          try {
            const ok = await sendWhatsappMessage(texto, dest.telefone);
            if (!ok) {
              erros.push({
                etapa: "whatsapp-evasao",
                motivo: `envio falhou para ${dest.nome}`,
              });
            }
          } catch (e) {
            erros.push({
              etapa: "whatsapp-evasao",
              motivo: `${dest.nome}: ${e instanceof Error ? e.message : "?"}`,
            });
          }
        }
      }
    }

    try {
      await prisma.alertaClienteLog.upsert({
        where: { chave },
        create: {
          chave,
          gatilho: d.gatilho,
          clienteId: d.cliente.id,
          status: "ativo",
          statusDesde: estado.statusDesde,
          alertadoEm: estado.alertadoEm,
          ultimoValor: d.valor,
        },
        update: {
          status: "ativo",
          statusDesde: estado.statusDesde,
          alertadoEm: estado.alertadoEm,
          ultimoValor: d.valor,
        },
      });
    } catch (e) {
      erros.push({ etapa: "upsert", motivo: e instanceof Error ? e.message : "?" });
    }
  }

  // Estava ativo e não dispara mais → resolve (sem Slack, só reabre p/ futuro)
  for (const row of rows) {
    if (row.status !== "ativo" || firingMap.has(row.chave)) continue;
    try {
      await prisma.alertaClienteLog.update({
        where: { chave: row.chave },
        data: { status: "resolvido", alertadoEm: null, statusDesde: null },
      });
      resolvidos++;
    } catch (e) {
      erros.push({ etapa: "resolver", motivo: e instanceof Error ? e.message : "?" });
    }
  }

  const durationMs = Date.now() - start;
  const message =
    `${clientes.length} A/B avaliados · saldo:${disparandoPorGatilho.saldo_parado} ` +
    `rf:${disparandoPorGatilho.rf_vencendo}${rfDormente ? "(dormente)" : ""} ` +
    `termômetro:${disparandoPorGatilho.termometro_vermelho} · ` +
    `${enviados} alerta(s) enviado(s), ${resolvidos} resolvido(s), ${erros.length} erro(s).`;

  await prisma.btgSyncLog.update({
    where: { id: log.id },
    data: {
      finalizado: new Date(),
      sucesso: erros.length === 0,
      contasProcessadas: enviados,
      contasComErro: erros.length,
      resumo: message,
      erros: erros.length > 0 ? (erros as never) : undefined,
    },
  });

  return {
    ok: erros.length === 0,
    logId: log.id,
    avaliados: clientes.length,
    disparandoPorGatilho,
    enviados,
    resolvidos,
    rfDormente,
    erros,
    durationMs,
    message,
  };
}
