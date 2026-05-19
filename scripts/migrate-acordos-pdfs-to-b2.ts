/**
 * Migra os PDFs existentes em AcordoComercial.contratoBase64 pra o B2 via
 * ContratoArquivo. Idempotente: pula AcordoComercial que já tem
 * ContratoArquivo vinculado.
 *
 * Uso:
 *   1. Configurar B2_* no env (DATABASE_URL, ANTHROPIC_API_KEY também).
 *   2. npx tsx scripts/migrate-acordos-pdfs-to-b2.ts [--dry-run]
 *
 * Em --dry-run mostra o que seria migrado sem escrever no B2 nem chamar Claude.
 *
 * Eduardo precisa de um User dele no DB (usado como uploadedBy). O script
 * resolve pelo CPF padrão (01536247529).
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "node:crypto";
import { uploadContrato } from "../src/lib/b2/upload";
import { extrairDadosContrato } from "../src/lib/parser/contrato";

const CPF_EDUARDO = "01536247529";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`🔄 Migrando AcordoComercial.contratoBase64 → ContratoArquivo (B2)`);
  console.log(`   Modo: ${dryRun ? "DRY-RUN" : "EXECUTAR"}`);

  const eduardo = await prisma.user.findUnique({
    where: { cpf: CPF_EDUARDO },
    select: { id: true, name: true },
  });
  if (!eduardo) {
    throw new Error(`User Eduardo (CPF ${CPF_EDUARDO}) não encontrado no DB.`);
  }
  console.log(`   Uploader padrão: ${eduardo.name} (${eduardo.id})\n`);

  const acordos = await prisma.acordoComercial.findMany({
    where: {
      contratoBase64: { not: null },
      contratoArquivo: null,
    },
    select: {
      id: true,
      pessoaId: true,
      tipo: true,
      contratoFilename: true,
      contratoMimeType: true,
      contratoBase64: true,
      contratoBytes: true,
      pessoa: { select: { apelido: true, nomeCompleto: true } },
    },
  });

  console.log(`Encontrados ${acordos.length} acordos com PDF embutido pra migrar.\n`);

  if (acordos.length === 0) {
    console.log("Nada a fazer. ✓");
    return;
  }

  let migrados = 0;
  let pulados = 0;
  let erros = 0;

  for (const a of acordos) {
    const label = `${a.pessoa?.apelido ?? a.pessoa?.nomeCompleto ?? "?"} (${a.tipo})`;

    if (!a.contratoBase64) {
      pulados++;
      continue;
    }

    const buffer = Buffer.from(a.contratoBase64, "base64");
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");

    const jaExiste = await prisma.contratoArquivo.findUnique({
      where: { hashSha256: hash },
      select: { id: true },
    });
    if (jaExiste) {
      console.log(`  ↻ ${label}: hash já existe (${jaExiste.id}) — vinculando ao acordo`);
      if (!dryRun) {
        await prisma.contratoArquivo.update({
          where: { id: jaExiste.id },
          data: { acordoComercialId: a.id, pessoaId: a.pessoaId },
        });
      }
      pulados++;
      continue;
    }

    const id = crypto.randomBytes(12).toString("base64url");
    const key = `pessoas/${a.pessoaId}/${id}.pdf`;

    console.log(
      `  → ${label} | ${a.contratoFilename ?? "(sem nome)"} | ${(buffer.length / 1024).toFixed(0)}KB`
    );

    if (dryRun) {
      migrados++;
      continue;
    }

    try {
      const uploaded = await uploadContrato({
        key,
        body: buffer,
        contentType: a.contratoMimeType || "application/pdf",
        metadata: {
          hash,
          "uploaded-by": eduardo.id,
          "migrated-from": `acordo:${a.id}`,
        },
      });

      const contrato = await prisma.contratoArquivo.create({
        data: {
          id,
          nomeOriginal: a.contratoFilename || `contrato-${a.tipo}.pdf`,
          mimeType: a.contratoMimeType || "application/pdf",
          tamanhoBytes: BigInt(buffer.length),
          b2Bucket: uploaded.bucket,
          b2Key: uploaded.key,
          b2ETag: uploaded.etag,
          hashSha256: hash,
          uploadedById: eduardo.id,
          status: "aprovado", // PDFs migrados já vêm aprovados (já estavam no AcordoComercial)
          origemImportacao: "migracao_acordo",
          pessoaId: a.pessoaId,
          acordoComercialId: a.id,
          observacoes: "Migrado automaticamente de AcordoComercial.contratoBase64",
        },
        select: { id: true },
      });

      // Roda extração via Claude (best-effort — não falha a migração se der erro)
      const extracao = await extrairDadosContrato(buffer).catch((e) => ({
        ok: false as const,
        erro: e.message,
      }));

      if (extracao.ok) {
        await prisma.contratoExtracao.create({
          data: {
            contratoArquivoId: contrato.id,
            modeloIa: extracao.modelo,
            promptVersion: extracao.promptVersion,
            confianca: extracao.confianca,
            dadosExtraidos: extracao.dadosExtraidos as Prisma.InputJsonValue,
            statusRevisao: "aprovado",
            revisadoPorId: eduardo.id,
            revisadoEm: new Date(),
            observacoesRevisao: "Auto-aprovado na migração (já estava em uso)",
          },
        });
        console.log(`     ✓ extração ${(extracao.confianca * 100).toFixed(0)}%`);
      } else {
        await prisma.contratoExtracao.create({
          data: {
            contratoArquivoId: contrato.id,
            modeloIa: process.env.CLAUDE_MODEL_PARSER || "claude-opus-4-7",
            promptVersion: "v1",
            confianca: 0,
            dadosExtraidos: { erro: extracao.erro },
            erroExtracao: extracao.erro,
          },
        });
        console.log(`     ⚠ extração falhou: ${extracao.erro?.slice(0, 80)}`);
      }

      migrados++;
    } catch (e) {
      const err = e as Error;
      console.error(`     ✗ ${err.message}`);
      erros++;
    }
  }

  console.log(`\n📊 Resultado: ${migrados} migrados, ${pulados} pulados (já existiam), ${erros} erros`);
  console.log(`\n⚠ IMPORTANTE: depois de validar, rode esta query pra limpar o base64:`);
  console.log(`   UPDATE "AcordoComercial" SET "contratoBase64" = NULL, "contratoBytes" = NULL`);
  console.log(`   WHERE id IN (SELECT "acordoComercialId" FROM "ContratoArquivo" WHERE "acordoComercialId" IS NOT NULL);`);
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
