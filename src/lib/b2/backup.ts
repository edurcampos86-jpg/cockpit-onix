import "server-only";
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";
import { getB2ClientBackups, bucketBackups } from "./client";

/**
 * I/O do bucket de BACKUPS (cliente B2 separado do contratos — least privilege).
 * Usado pela Fase 1C: cron de backup diário, restore test mensal.
 */

export type BackupUploadResult = {
  bucket: string;
  key: string;
  etag: string | null;
  size: number;
};

export async function uploadBackup(params: {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}): Promise<BackupUploadResult> {
  const client = getB2ClientBackups();
  const bucket = bucketBackups();

  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType || "application/gzip",
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

export async function downloadBackup(key: string): Promise<Buffer> {
  const client = getB2ClientBackups();
  const bucket = bucketBackups();
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
  const result = await client.send(cmd);
  if (!result.Body) throw new Error(`B2 backup: corpo vazio em ${bucket}/${key}`);
  const stream = result.Body as Readable;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteBackup(key: string): Promise<void> {
  const client = getB2ClientBackups();
  const bucket = bucketBackups();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Lista todos os objetos com prefix (ex: "postgres/"). Pagina automaticamente. */
export async function listBackups(prefix: string): Promise<
  Array<{ key: string; size: number; lastModified: Date }>
> {
  const client = getB2ClientBackups();
  const bucket = bucketBackups();
  const all: Array<{ key: string; size: number; lastModified: Date }> = [];
  let continuationToken: string | undefined;

  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    for (const obj of result.Contents ?? []) {
      if (!obj.Key || obj.Size == null || !obj.LastModified) continue;
      all.push({ key: obj.Key, size: obj.Size, lastModified: obj.LastModified });
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);

  return all;
}
