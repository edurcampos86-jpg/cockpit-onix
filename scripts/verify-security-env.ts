/**
 * Verificação de variáveis de ambiente de segurança.
 *
 * Uso:
 *  - CI/manual:    `npm run check:env`         (sai 1 se faltar algo)
 *  - Boot da app:  importado por instrumentation.ts (apenas em produção)
 *
 * Não loga valores — só nomes e diagnósticos.
 */

type Severity = "required" | "recommended";

type Check = {
  name: string;
  severity: Severity;
  minLength?: number;
  description: string;
};

const CHECKS: Check[] = [
  {
    name: "SESSION_SECRET",
    severity: "required",
    minLength: 32,
    description: "Chave HMAC do JWT da sessão. Trocar = força logout de todos.",
  },
  {
    name: "SECRETS_ENCRYPTION_KEY",
    severity: "required",
    minLength: 32,
    description:
      "Chave-mestra do storage cifrado (totpSecret e .integrations.enc.json). NÃO TROCAR — invalida 2FAs e segredos cifrados.",
  },
  {
    name: "DATABASE_URL",
    severity: "required",
    minLength: 10,
    description: "Conexão Postgres do Prisma.",
  },
  {
    name: "CRON_SECRET",
    severity: "required",
    minLength: 16,
    description:
      "Bearer token exigido em /api/cron/*. Sem ele, os crons retornam 503 em produção.",
  },
  {
    name: "DASHBOARD_API_SECRET",
    severity: "required",
    minLength: 16,
    description:
      "Compartilhado com sistema externo que faz POST em /api/onix-corretora/ingest. Sem ele, o endpoint retorna 503.",
  },
  {
    name: "ZAPIER_WEBHOOK_SECRET",
    severity: "required",
    minLength: 16,
    description:
      "Header x-webhook-secret esperado em /api/integracoes/zapier/webhook. Sem ele, o webhook recusa todas as requests em produção.",
  },
  {
    name: "ANTHROPIC_API_KEY",
    severity: "recommended",
    minLength: 10,
    description: "Necessário para análises com Claude AI.",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    severity: "recommended",
    minLength: 10,
    description: "Necessário para integração Google Calendar.",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    severity: "recommended",
    minLength: 10,
    description: "Necessário para integração Google Calendar.",
  },
  {
    name: "BTG_CLIENT_ID",
    severity: "recommended",
    minLength: 10,
    description: "Necessário para sincronizar saldo BTG dos clientes.",
  },
  {
    name: "BTG_CLIENT_SECRET",
    severity: "recommended",
    minLength: 10,
    description: "Necessário para sincronizar saldo BTG dos clientes.",
  },
];

export type EnvCheckResult = {
  ok: boolean;
  problems: Array<{ name: string; severity: Severity; reason: string }>;
};

export function runEnvChecks(): EnvCheckResult {
  const problems: EnvCheckResult["problems"] = [];

  for (const c of CHECKS) {
    const v = process.env[c.name];
    if (!v) {
      problems.push({ name: c.name, severity: c.severity, reason: "ausente" });
      continue;
    }
    if (c.minLength && v.length < c.minLength) {
      problems.push({
        name: c.name,
        severity: c.severity,
        reason: `tamanho ${v.length} < ${c.minLength} (mínimo)`,
      });
    }
  }

  const requiredFails = problems.filter((p) => p.severity === "required");
  return { ok: requiredFails.length === 0, problems };
}

export function reportEnvChecks(result: EnvCheckResult): void {
  const reqFails = result.problems.filter((p) => p.severity === "required");
  const recFails = result.problems.filter((p) => p.severity === "recommended");

  if (reqFails.length === 0 && recFails.length === 0) {
    console.log("[env] todas as variáveis de segurança OK");
    return;
  }

  if (reqFails.length > 0) {
    console.error("[env] FALTANDO variáveis OBRIGATÓRIAS:");
    for (const p of reqFails) {
      const desc = CHECKS.find((c) => c.name === p.name)?.description ?? "";
      console.error(`  • ${p.name}  (${p.reason})  — ${desc}`);
    }
  }
  if (recFails.length > 0) {
    console.warn("[env] variáveis recomendadas faltando:");
    for (const p of recFails) {
      const desc = CHECKS.find((c) => c.name === p.name)?.description ?? "";
      console.warn(`  • ${p.name}  (${p.reason})  — ${desc}`);
    }
  }
}

// CLI entry point
const isCli =
  typeof require !== "undefined" && require.main === module;
if (isCli) {
  const result = runEnvChecks();
  reportEnvChecks(result);
  process.exit(result.ok ? 0 : 1);
}
