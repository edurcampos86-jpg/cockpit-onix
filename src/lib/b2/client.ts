import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cliente Backblaze B2 via API S3-compatible.
 *
 * Por que S3 e não o SDK proprietário do B2: o `@backblaze-b2/sdk` original
 * usa a API v1 (legacy). O B2 expõe a interface S3 estável em
 * https://www.backblaze.com/b2/docs/s3_compatible_api.html e qualquer mudança
 * vem com versionamento padrão AWS. Em troca pagamos uma única dep (`client-s3`).
 *
 * Env vars necessárias:
 *   - B2_ENDPOINT             ex: https://s3.us-west-004.backblazeb2.com
 *   - B2_REGION               ex: us-west-004
 *   - B2_APPLICATION_KEY_ID   ID da Application Key (apenas read+write nos buckets contratos/backups)
 *   - B2_APPLICATION_KEY      segredo da Application Key
 */

let cachedClient: S3Client | null = null;

export function getB2Client(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_REGION || "us-west-004";
  const accessKeyId = process.env.B2_APPLICATION_KEY_ID;
  const secretAccessKey = process.env.B2_APPLICATION_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "B2 não configurado: defina B2_ENDPOINT, B2_APPLICATION_KEY_ID e B2_APPLICATION_KEY no env."
    );
  }

  cachedClient = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });

  return cachedClient;
}

export function bucketContratos(): string {
  return process.env.B2_BUCKET_CONTRATOS || "onix-cockpit-contratos";
}

export function bucketBackups(): string {
  return process.env.B2_BUCKET_BACKUPS || "onix-cockpit-backups";
}

export function b2Configurado(): boolean {
  return Boolean(
    process.env.B2_ENDPOINT &&
      process.env.B2_APPLICATION_KEY_ID &&
      process.env.B2_APPLICATION_KEY
  );
}
