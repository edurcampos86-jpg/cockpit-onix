import "server-only";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  NoSuchKey,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { getB2Client, bucketContratos } from "./client";

export type UploadResult = {
  bucket: string;
  key: string;
  etag: string | null;
  size: number;
};

/**
 * Faz upload de um Buffer pro bucket de contratos. Idempotente em relação ao
 * conteúdo: o caller passa a `key` e essa função sobrescreve se já existir.
 * Dedup por hash deve ser feito ANTES de chamar — esta camada é só I/O.
 */
export async function uploadContrato(params: {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<UploadResult> {
  const client = getB2Client();
  const bucket = bucketContratos();

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType || "application/pdf",
    Metadata: params.metadata,
  });

  const result = await client.send(cmd);

  return {
    bucket,
    key: params.key,
    etag: result.ETag?.replace(/"/g, "") ?? null,
    size: params.body.length,
  };
}

/** Baixa um objeto e devolve Buffer (PDFs ficam em alguns MB, OK pra memória). */
export async function downloadContrato(key: string): Promise<Buffer> {
  const client = getB2Client();
  const bucket = bucketContratos();

  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const result = await client.send(cmd);

  if (!result.Body) {
    throw new Error(`B2: corpo vazio em ${bucket}/${key}`);
  }

  const stream = result.Body as Readable;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/** Move objeto entre keys (B2 não tem rename — copia + deleta). */
export async function moveContrato(params: {
  fromKey: string;
  toKey: string;
}): Promise<void> {
  const client = getB2Client();
  const bucket = bucketContratos();

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: params.toKey,
      CopySource: `${bucket}/${encodeURIComponent(params.fromKey)}`,
    })
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: params.fromKey }));
}

export async function deleteContrato(key: string): Promise<void> {
  const client = getB2Client();
  const bucket = bucketContratos();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Verifica se uma key existe — usado pra recuperação de upload incompleto. */
export async function contratoExiste(key: string): Promise<boolean> {
  const client = getB2Client();
  const bucket = bucketContratos();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e instanceof NoSuchKey) return false;
    if (
      e instanceof Error &&
      "name" in e &&
      (e.name === "NotFound" || e.name === "NoSuchKey")
    ) {
      return false;
    }
    throw e;
  }
}
