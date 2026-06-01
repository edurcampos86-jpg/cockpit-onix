/**
 * Núcleo PURO do Auditor de Integrações (sem prisma / sem server-only).
 *
 * Separa a lógica decidível — classificar erro, avaliar o resultado de um
 * probe, decidir quando alertar no Slack — do IO (rodar o teste de cada
 * integração, persistir estado, mandar mensagem). Assim é unit-testável.
 */

export type StatusIntegracao =
  | "ok" // token válido, nada a fazer
  | "refresh_recuperado" // access token estava vencido e o refresh renovou (auto-curado)
  | "precisa_reconectar" // refresh inválido/expirado/escopo — exige consentimento humano
  | "transitorio"; // rede / rate limit / erro temporário

/**
 * Resultado de um "probe" leve numa integração.
 * - ok: token válido (cache hit, sem refresh)
 * - refreshed: access token estava vencido e o refresh token renovou
 * - erro: a chamada falhou; `mensagem` carrega o motivo cru pra classificação
 */
export type ProbeResultado =
  | { tipo: "ok" }
  | { tipo: "refreshed" }
  | { tipo: "erro"; mensagem: string };

/**
 * Classifica uma mensagem de erro crua em "precisa_reconectar" (consentimento
 * humano) vs "transitorio" (retry resolve). Alinhado com o classifyLastError
 * das rotas /api/integracoes/{google,microsoft}/status.
 *
 * REALIDADE: invalid_grant / expired / escopo insuficiente NÃO se renovam por
 * código — só re-consentimento no navegador. Por isso viram precisa_reconectar.
 */
export function classificarErro(mensagem: string): "precisa_reconectar" | "transitorio" {
  const m = mensagem || "";
  // Reconexão humana obrigatória:
  if (
    /invalid_grant|AADSTS70008|AADSTS50173|token (expired|revoked)|expirad|revogad|insufficient[\s_]*(scope|permission)|escopo insuficiente|invalid_client|unauthorized_client|invalid_scope/i.test(
      m,
    )
  ) {
    return "precisa_reconectar";
  }
  // Transitório (rede / quota / 5xx) — retry resolve:
  // qualquer outra coisa cai aqui (conservador: não gritar "reconecte" no incerto).
  return "transitorio";
}

/** Mapeia o resultado de um probe no status final da integração. */
export function avaliarProbe(p: ProbeResultado): StatusIntegracao {
  if (p.tipo === "ok") return "ok";
  if (p.tipo === "refreshed") return "refresh_recuperado";
  return classificarErro(p.mensagem);
}

// ── Decisão de alerta (dedupe / transição / 3-strikes / reenvio diário) ──

export const TRANSITORIO_LIMIAR = 3; // transitório só alerta se persistir 3 checagens
export const REALERT_MS = 24 * 60 * 60 * 1000; // reenvia 1x/dia enquanto seguir caída

export type EstadoAuditoria = {
  status: StatusIntegracao | null;
  statusDesde: Date | null; // desde quando começou a falhar
  alertadoEm: Date | null; // último alerta enviado (null = nenhum alerta aberto)
  transitorioStreak: number;
};

export type AcaoAlerta = "caiu" | "reenvio" | "resolvido" | "nada";

function saudavel(s: StatusIntegracao): boolean {
  return s === "ok" || s === "refresh_recuperado";
}

function falhando(s: StatusIntegracao): boolean {
  return s === "precisa_reconectar" || s === "transitorio";
}

/** "Caído o suficiente para alertar": reconectar sempre; transitório só no 3º strike. */
export function caido(status: StatusIntegracao, transitorioStreak: number): boolean {
  if (status === "precisa_reconectar") return true;
  if (status === "transitorio") return transitorioStreak >= TRANSITORIO_LIMIAR;
  return false;
}

/**
 * Decide a ação de alerta dado o estado anterior, o status novo e o instante.
 *
 * - caiu: entrou em estado de alerta (e não havia alerta aberto) → notifica
 * - reenvio: segue caída e já passou >=24h do último alerta → re-notifica
 * - resolvido: estava com alerta aberto e voltou a ficar saudável → notifica
 * - nada: dedupe (já alertado e <24h) ou sem mudança relevante
 *
 * `alertadoEm != null` é a flag de "alerta aberto" (dedupe). statusDesde marca
 * a PRIMEIRA falha da sequência atual (para "há quanto tempo caiu").
 */
export function decidirAlerta(
  prev: EstadoAuditoria,
  novo: StatusIntegracao,
  agora: Date,
): { acao: AcaoAlerta; estado: EstadoAuditoria } {
  const novoStreak = novo === "transitorio" ? (prev.transitorioStreak ?? 0) + 1 : 0;
  const caidoAgora = caido(novo, novoStreak);
  const ultimoAlerta = prev.alertadoEm; // null = nenhum alerta aberto (dedupe)

  const statusDesde = falhando(novo)
    ? prev.status && falhando(prev.status) && prev.statusDesde
      ? prev.statusDesde
      : agora
    : null;

  let acao: AcaoAlerta = "nada";
  let alertadoEm = ultimoAlerta ?? null;

  if (caidoAgora) {
    if (ultimoAlerta == null) {
      acao = "caiu";
      alertadoEm = agora;
    } else if (agora.getTime() - ultimoAlerta.getTime() >= REALERT_MS) {
      acao = "reenvio";
      alertadoEm = agora;
    } else {
      acao = "nada"; // dedupe: já alertado há <24h
    }
  } else if (saudavel(novo)) {
    if (ultimoAlerta != null) acao = "resolvido";
    alertadoEm = null;
  } else {
    // transitório abaixo do limiar: não alerta, mas mantém alerta aberto se já existia
    acao = "nada";
  }

  return {
    acao,
    estado: { status: novo, statusDesde, alertadoEm, transitorioStreak: novoStreak },
  };
}
