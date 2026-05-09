/**
 * Cron semanal de alerta de promoções de passagem.
 *
 * Lê viagens.json do Drive, consulta preços via Anthropic SDK (web search),
 * atualiza preco_historico e dispara DM no Slack se houver promoções
 * >= THRESHOLD_ALERTA abaixo da média histórica.
 *
 * Disparado por .github/workflows/viagens-alerta-semanal.yml.
 *
 * Modo de produção (env):
 *   ANTHROPIC_API_KEY            chave da Anthropic
 *   GOOGLE_SERVICE_ACCOUNT_JSON  JSON inline da service account com escopo Drive
 *   SLACK_BOT_TOKEN              xoxb- token de bot Slack
 *
 * Modo dry-run (`--dry-run` ou env DRY_RUN=1):
 *   Lê fixture local em scripts/viagens-alerta.fixture.json no lugar do Drive,
 *   imprime a mensagem do Slack no stdout em vez de postar, e não escreve no
 *   Drive. Útil para testar a lógica antes de configurar SA/Slack.
 *   Ainda chama Anthropic — defina MOCK_PRICES=1 para usar preços simulados.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import { WebClient as SlackWebClient } from "@slack/web-api";

const DRY_RUN = process.argv.includes("--dry-run") || process.env.DRY_RUN === "1";
const MOCK_PRICES = process.env.MOCK_PRICES === "1";
const FIXTURE_PATH = resolve(
  process.cwd(),
  "scripts/viagens-alerta.fixture.json",
);

const DRIVE_FILE_ID = "1FMFNFMsI1bWIschGU8ALcyk8BHykQXaE";
const SLACK_USER_ID = "U0ANXQPQHBL";
const SLACK_FALLBACK_CHANNEL = "#viagens";
const ORIGEM = "SSA";
const THRESHOLD_PCT = 0.3;
const MIN_AMOSTRAS = 4;
const HOJE = new Date().toISOString().slice(0, 10);

type Viagem = {
  id: string;
  destino: string;
  status: "realizada" | "planejada";
  datas: { ida: string | null; volta: string | null };
  destino_iata?: string;
};
type WishItem = { destino: string; motivo?: string; destino_iata?: string };
type AmostraPreco = { data: string; preco_brl: number };
type ViagensFile = {
  perfil: { origem: string; moeda: string };
  viagens: Viagem[];
  wishlist: WishItem[];
  preco_historico: Record<string, AmostraPreco[]>;
};

function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON ausente");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function readState(): Promise<ViagensFile> {
  if (DRY_RUN) {
    return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as ViagensFile;
  }
  const drive = driveClient();
  const res = await drive.files.get(
    { fileId: DRIVE_FILE_ID, alt: "media" },
    { responseType: "json" },
  );
  return res.data as ViagensFile;
}

async function writeState(data: ViagensFile): Promise<void> {
  if (DRY_RUN) {
    console.log("[dry-run] writeDrive seria chamado; pulando.");
    return;
  }
  const drive = driveClient();
  await drive.files.update({
    fileId: DRIVE_FILE_ID,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(data, null, 2),
    },
  });
}

type RotaAlvo = { destino: string; iata: string; janela: string };

function montarRotas(data: ViagensFile): RotaAlvo[] {
  const rotas: RotaAlvo[] = [];
  const visto = new Set<string>();
  const noveMesesAFrente = new Date();
  noveMesesAFrente.setMonth(noveMesesAFrente.getMonth() + 9);

  for (const v of data.viagens) {
    if (v.status !== "planejada" || !v.destino_iata) continue;
    if (v.datas.ida && new Date(v.datas.ida) > noveMesesAFrente) continue;
    const janela =
      v.datas.ida && v.datas.volta
        ? `${v.datas.ida} a ${v.datas.volta}`
        : "próximos 9 meses";
    if (!visto.has(v.destino_iata)) {
      rotas.push({ destino: v.destino, iata: v.destino_iata, janela });
      visto.add(v.destino_iata);
    }
  }
  for (const w of data.wishlist) {
    if (!w.destino_iata || visto.has(w.destino_iata)) continue;
    rotas.push({ destino: w.destino, iata: w.destino_iata, janela: "próximos 3 meses" });
    visto.add(w.destino_iata);
  }
  return rotas;
}

async function buscarPrecoAtual(
  anthropic: Anthropic,
  rota: RotaAlvo,
): Promise<number | null> {
  if (MOCK_PRICES) {
    // Determinístico para a fixture: LIS dispara alerta, KIX e CPT não.
    const mocked: Record<string, number> = {
      LIS: 2900, // ~35% abaixo da média histórica de ~4457
      KIX: 7950, // próximo da média ~7900
      CPT: 11700, // próximo da média ~11880
    };
    return mocked[rota.iata] ?? 5000;
  }
  const resp = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 512,
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 3 },
    ] as unknown as Anthropic.Messages.Tool[],
    messages: [
      {
        role: "user",
        content:
          `Busque o preço atual mais baixo de uma passagem aérea ida e volta de ` +
          `${ORIGEM} (Salvador) para ${rota.iata} (${rota.destino}) na janela ${rota.janela}. ` +
          `Responda APENAS no formato JSON: {"preco_brl": <numero>, "fonte": "<url>"}. ` +
          `Se não encontrar, responda {"preco_brl": null, "fonte": null}.`,
      },
    ],
  });
  const textBlock = resp.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;
  const match = textBlock.text.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return typeof parsed.preco_brl === "number" ? parsed.preco_brl : null;
  } catch {
    return null;
  }
}

function media(amostras: AmostraPreco[]): number {
  return amostras.reduce((s, a) => s + a.preco_brl, 0) / amostras.length;
}

type Alerta = {
  destino: string;
  iata: string;
  precoAtual: number;
  mediaHist: number;
  desconto: number;
  janela: string;
};

async function postarSlack(alertas: Alerta[]): Promise<void> {
  const linhas = alertas.map(
    (a) =>
      `• *${a.destino}* (${a.iata}) — R$ ${a.precoAtual.toLocaleString("pt-BR")} · ` +
      `${(a.desconto * 100).toFixed(0)}% abaixo da média ` +
      `(R$ ${a.mediaHist.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}) · ` +
      `janela: ${a.janela}`,
  );
  const text =
    `:airplane: *Promoções da semana — saindo de SSA*\n\n${linhas.join("\n")}\n\n` +
    `_Ver timeline completa: rode \`/viagens listar planejadas\`_`;

  if (DRY_RUN) {
    console.log("\n[dry-run] mensagem que seria postada no Slack:\n");
    console.log(text);
    console.log();
    return;
  }

  const slack = new SlackWebClient(process.env.SLACK_BOT_TOKEN);
  try {
    await slack.chat.postMessage({ channel: SLACK_USER_ID, text });
  } catch (err) {
    console.warn("DM falhou, tentando fallback no canal:", err);
    await slack.chat.postMessage({ channel: SLACK_FALLBACK_CHANNEL, text });
  }
}

async function main() {
  if (DRY_RUN) console.log("==> Modo dry-run (sem Drive write, sem Slack post)");
  if (MOCK_PRICES) console.log("==> MOCK_PRICES=1: pulando Anthropic, usando preços simulados");

  const anthropic = MOCK_PRICES
    ? (null as unknown as Anthropic)
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const data = await readState();
  const rotas = montarRotas(data);
  console.log(`Vigiando ${rotas.length} rotas em ${HOJE}`);

  const alertas: Alerta[] = [];
  for (const rota of rotas) {
    const trecho = `${ORIGEM}-${rota.iata}`;
    const preco = await buscarPrecoAtual(anthropic, rota);
    if (preco == null) {
      console.log(`  ${trecho}: preço não encontrado`);
      continue;
    }

    const historico = (data.preco_historico[trecho] ??= []);
    if (!historico.some((a) => a.data === HOJE)) {
      historico.push({ data: HOJE, preco_brl: preco });
    }

    if (historico.length < MIN_AMOSTRAS) {
      console.log(`  ${trecho}: R$ ${preco} (poucas amostras: ${historico.length})`);
      continue;
    }

    const mediaHist = media(historico);
    const desconto = (mediaHist - preco) / mediaHist;
    console.log(
      `  ${trecho}: R$ ${preco} vs média R$ ${mediaHist.toFixed(0)} ` +
        `(desconto ${(desconto * 100).toFixed(1)}%)`,
    );

    if (desconto >= THRESHOLD_PCT) {
      alertas.push({
        destino: rota.destino,
        iata: rota.iata,
        precoAtual: preco,
        mediaHist,
        desconto,
        janela: rota.janela,
      });
    }
  }

  await writeState(data);

  if (alertas.length === 0) {
    console.log(`Sem promoções acima do threshold em ${HOJE}`);
    return;
  }

  await postarSlack(alertas);
  if (!DRY_RUN) console.log(`Postado ${alertas.length} alerta(s) no Slack`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
