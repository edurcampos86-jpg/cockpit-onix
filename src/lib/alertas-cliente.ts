import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import {
  contaComoToque,
  cumprimentoCadencia,
  inicioJanelaToques,
  riscoEvasaoReuniao,
} from "@/lib/cadencia-core";
import { destinatariosPorCge } from "@/lib/alertas/destinatarios";
import type { ResolucaoDestinatarios } from "@/lib/alertas/destinatarios-core";
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
 * dispara quando um cliente A/B cruza um gatilho. Dedupe por (gatilho, cliente)
 * via AlertaClienteLog, reenvio no máx 1x/semana.
 *
 * ── Para quem vai (mudou em 22/08/2026) ──
 * ANTES: canal `#ecossistema-onix`, o escritório inteiro. AGORA: WhatsApp
 * individual do ASSESSOR responsável pelo cliente e do BACKOFFICE da carteira
 * dele, pelo mesmo caminho que o alerta de evasão já usava. Motivo: alerta que
 * é de todo mundo não é de ninguém — e o broadcast ainda expunha nome, conta e
 * saldo de cliente para quem não atende aquela carteira.
 *
 * Nenhum canal novo, nenhum segredo novo. O destinatário sai da carteira que a
 * tela de Permissões já monta (ver `alertas/destinatarios.ts`).
 *
 * Gatilhos (limiares em Config/env, ajustáveis sem deploy):
 *   1. saldo_parado       — saldoConta > ALERTA_SALDO_PARADO_MIN (R$100k) e
 *      SEM movimento de aplicação nos últimos ALERTA_SALDO_SEM_APLICACAO_DIAS.
 *   2. rf_vencendo        — renda fixa vencendo nos próximos
 *      ALERTA_RF_VENCIMENTO_DIAS dias. DORMENTE: depende de vencimento por
 *      ativo, que a API BTG ainda não entrega (getPartnerPositions vazio) e o
 *      arquivo não traz. Ativa sozinho quando breakdownProdutos tiver datas.
 *   3. termometro_vermelho — cliente classe A que NÃO cumpriu a cadência
 *      12-4-2 nos últimos 12 meses. Passou a contar TOQUES (ligações +
 *      reuniões) contra o alvo da classe, no lugar de medir dias desde o
 *      último contato. O nome do gatilho fica como está: renomeá-lo quebraria
 *      o dedupe de `AlertaClienteLog`, cuja chave carrega o nome antigo em
 *      todas as linhas já gravadas.
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
  /** CGE do assessor responsável — é por ele que o alerta acha o destinatário. */
  assessorCge: string | null;
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
      assessorCge: true,
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

  // Gatilho 3: cadência 12-4-2 não cumprida (só classe A).
  //
  // Conta TOQUES no último ano (ligações + reuniões) contra o alvo da classe.
  // Antes media dias desde o último contato, o que dava por cumprida a promessa
  // de um ano inteiro por causa de uma única ligação recente.
  //
  // Uma query só, agregada, para toda a carteira A: uma por cliente seriam
  // centenas de idas ao banco dentro do cron.
  const clientesA = clientes.filter((c) => c.classificacao.toUpperCase() === "A");
  if (clientesA.length > 0) {
    try {
      const toques = await prisma.interacaoCliente.findMany({
        where: {
          clienteId: { in: clientesA.map((c) => c.id) },
          data: { gte: inicioJanelaToques(agora) },
        },
        select: { clienteId: true, tipo: true },
      });

      const porCliente = new Map<string, number>();
      for (const t of toques) {
        if (!contaComoToque(t.tipo)) continue;
        porCliente.set(t.clienteId, (porCliente.get(t.clienteId) ?? 0) + 1);
      }

      for (const c of clientesA) {
        const feitos = porCliente.get(c.id) ?? 0;
        // `temHistorico` amarra no mesmo sinal de antes: cliente que nunca foi
        // contatado é neutro, não atrasado. Sem isso, toda conta recém-aberta
        // entraria alertando no primeiro dia.
        const r = cumprimentoCadencia(c.classificacao, feitos, !!c.ultimoContatoAt);
        if (r.status !== "alerta") continue;
        disparos.push({
          gatilho: "termometro_vermelho",
          cliente: c,
          detalhe:
            `${r.feitos} de ${r.alvo} toques nos últimos 12 meses ` +
            `(ligações + reuniões). Alvo da classe A: ${r.alvoComRevisao}/ano — ` +
            `${r.revisoesNaoRastreadas} revisões ainda não são rastreadas pelo sistema.`,
          valor: `${r.feitos}/${r.alvo}`,
        });
      }
    } catch (e) {
      erros.push({ etapa: "cadencia-toques", motivo: e instanceof Error ? e.message : "?" });
    }
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
        // O alerta de evasão passa pelo mesmo roteamento dos demais — precisa
        // do CGE para achar o assessor.
        assessorCge: true,
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

  // ── Para quem vai cada alerta ──
  //
  // Um alerta é do ASSESSOR do cliente e do BACKOFFICE da carteira dele, não do
  // escritório. O mapeamento não é novo nem inventado: sai da carteira que a
  // tela de Permissões já monta — `assessorCge` → CarteiraCge → Carteira →
  // AcessoCarteira ("dono" = assessor, "apoia" = backoffice) → Pessoa.telefone.
  //
  // Resolvido UMA vez para os CGEs de todos os disparos: o cron avalia a
  // carteira inteira, e uma consulta por cliente seriam centenas de idas ao
  // banco para responder uma pergunta que quase não muda.
  let destinoPorCge = new Map<string, ResolucaoDestinatarios>();
  try {
    destinoPorCge = await destinatariosPorCge(
      [...firingMap.values()].map((d) => d.cliente.assessorCge ?? ""),
    );
  } catch (e) {
    erros.push({ etapa: "destinatarios", motivo: e instanceof Error ? e.message : "?" });
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
      const texto =
        `🚨 *${LABEL_GATILHO[d.gatilho]}*${lembrete}\n` +
        `${c.nome} (classe ${c.classificacao}, conta ${c.numeroConta})\n` +
        `${d.detalhe}\n${url}`;

      const destino = destinoPorCge.get(c.assessorCge ?? "");

      // Cliente sem carteira configurada NÃO some em silêncio. Antes o
      // broadcast cobria esse caso por acidente — todo mundo via tudo. Agora,
      // se não há assessor alcançável, isso vira erro no log do cron em vez de
      // um alerta que simplesmente não aconteceu.
      if (!destino || destino.orfao) {
        erros.push({
          etapa: "roteamento",
          motivo:
            `${c.nome} (conta ${c.numeroConta}): sem assessor alcançável ` +
            `para o CGE ${c.assessorCge ?? "—"} — alerta não entregue`,
        });
      }

      for (const nome of destino?.semTelefone ?? []) {
        erros.push({
          etapa: "roteamento",
          motivo: `${nome} atende ${c.nome} mas não tem telefone cadastrado em Pessoa`,
        });
      }

      for (const dest of destino?.destinatarios ?? []) {
        try {
          const ok = await sendWhatsappMessage(texto, dest.telefone);
          if (ok) enviados++;
          else erros.push({ etapa: "whatsapp", motivo: `envio falhou para ${dest.nome}` });
        } catch (e) {
          erros.push({
            etapa: "whatsapp",
            motivo: `${dest.nome}: ${e instanceof Error ? e.message : "?"}`,
          });
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
