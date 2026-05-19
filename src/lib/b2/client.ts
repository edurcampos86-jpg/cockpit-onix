import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Clientes Backblaze B2 via API S3-compatible — UM por bucket.
 *
 * Decisão de design: o Backblaze não permite via UI uma única Application
 * Key restrita a múltiplos buckets. Em vez de cair pra "All buckets"
 * (viola least privilege) ou usar a CLI b2 (operacional pesado), usamos
 * 2 Application Keys distintas, cada uma restrita ao seu bucket:
 *
 *   - cockpit-railway-contratos → onix-cockpit-contratos
 *   - cockpit-railway-backups   → onix-cockpit-backups
 *
 * Benefícios:
 *   - Blast radius isolado: vazar key de backup não compromete contratos.
 *   - Rotação independente: posso rotacionar a key de backups sem mexer
 *     no fluxo de upload de contratos (e vice-versa).
 *
 * Endpoint/region são compartilhados (mesma conta Backblaze).
 *
 * Env vars necessárias:
 *   - B2_ENDPOINT                       ex: https://s3.us-east-005.backblazeb2.com
 *   - B2_REGION                         ex: us-east-005
 *   - B2_APPLICATION_KEY_ID_CONTRATOS   ID da key restrita ao bucket de contratos
 *   - B2_APPLICATION_KEY_CONTRATOS      segredo (cabeça quente — só env)
 *   - B2_APPLICATION_KEY_ID_BACKUPS     ID da key restrita ao bucket de backups
 *   - B2_APPLICATION_KEY_BACKUPS        segredo
 *   - B2_BUCKET_CONTRATOS               default "onix-cockpit-contratos"
 *   - B2_BUCKET_BACKUPS                 default "onix-cockpit-backups"
 */

type B2Scope = "contratos" | "backups";

const clientCache = new Map<B2Scope, S3Client>();

function envKeys(scope: B2Scope): { idVar: string; secretVar: string } {
  return scope === "contratos"
    ? {
        idVar: "B2_APPLICATION_KEY_ID_CONTRATOS",
        secretVar: "B2_APPLICATION_KEY_CONTRATOS",
      }
    : {
        idVar: "B2_APPLICATION_KEY_ID_BACKUPS",
        secretVar: "B2_APPLICATION_KEY_BACKUPS",
      };
}

function buildClient(scope: B2Scope): S3Client {
  const { idVar, secretVar } = envKeys(scope);

  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION || "us-east-005";
  const accessKeyId = process.env[idVar];
  const secretAccessKey = process.env[secretVar];

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      `B2 não configurado para escopo "${scope}": defina B2_ENDPOINT, ${idVar} e ${secretVar}.`
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

export function getB2ClientContratos(): S3Client {
  let cli = clientCache.get("contratos");
  if (!cli) {
    cli = buildClient("contratos");
    clientCache.set("contratos", cli);
  }
  return cli;
}

export function getB2ClientBackups(): S3Client {
  let cli = clientCache.get("backups");
  if (!cli) {
    cli = buildClient("backups");
    clientCache.set("backups", cli);
  }
  return cli;
}

export function bucketContratos(): string {
  return process.env.B2_BUCKET_CONTRATOS || "onix-cockpit-contratos";
}

export function bucketBackups(): string {
  return process.env.B2_BUCKET_BACKUPS || "onix-cockpit-backups";
}

export function b2ContratosConfigurado(): boolean {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_APPLICATION_KEY_ID_CONTRATOS &&
      process.env.B2_APPLICATION_KEY_CONTRATOS
  );
}

export function b2BackupsConfigurado(): boolean {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_APPLICATION_KEY_ID_BACKUPS &&
      process.env.B2_APPLICATION_KEY_BACKUPS
  );
}

/** Compatibilidade — usado pela UI do módulo de contratos como gate. */
export function b2Configurado(): boolean {
  return b2ContratosConfigurado();
}
