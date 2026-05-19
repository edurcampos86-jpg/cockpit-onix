import "server-only";
import AdmZip from "adm-zip";
import { prisma } from "../prisma";
import { registrarUploadContrato } from "../juridico";

/**
 * Bulk import do ZIP do OneDrive 5.Jurídico (one-shot pra Fase 1C).
 *
 * Estratégia: assíncrono via fire-and-forget. Caller cria o ImportJob,
 * dispara processarZip() em background, e devolve jobId imediatamente.
 * Cliente polla GET /api/admin/import-juridico-bulk/[jobId]/status.
 *
 * Limites:
 *  - ZIP até 500 MB (limite checado na rota)
 *  - Apenas .pdf são processados (case-insensitive); outros tipos viram log
 *  - Dedup automática via hash SHA-256 (ContratoArquivo.hashSha256 unique)
 */

export type ResultadoArquivo = {
  caminho: string;
  status: "sucesso" | "erro" | "pulado_duplicata" | "pulado_nao_pdf";
  contratoArquivoId?: string;
  erro?: string;
};

export async function processarZip(params: {
  jobId: string;
  zipBuffer: Buffer;
  uploadedById: string;
}): Promise<void> {
  const start = Date.now();

  let zip: AdmZip;
  try {
    zip = new AdmZip(params.zipBuffer);
  } catch (e) {
    await prisma.importJob.update({
      where: { id: params.jobId },
      data: {
        status: "failed",
        finalizadoEm: new Date(),
        detalhes: [{ erro: `ZIP inválido: ${(e as Error).message}` }],
        duracaoSegundos: Math.round((Date.now() - start) / 1000),
      },
    });
    return;
  }

  const entries = zip.getEntries();
  const pdfEntries = entries.filter(
    (e) => !e.isDirectory && e.entryName.toLowerCase().endsWith(".pdf")
  );

  await prisma.importJob.update({
    where: { id: params.jobId },
    data: { totalArquivos: pdfEntries.length },
  });

  const detalhes: ResultadoArquivo[] = [];
  let processados = 0;
  let sucessos = 0;
  let erros = 0;
  let pulados = 0;

  for (const entry of pdfEntries) {
    const caminho = entry.entryName;
    const nome = caminho.split(/[/\\]/).pop() || "contrato.pdf";

    try {
      const buffer = entry.getData();
      const result = await registrarUploadContrato({
        buffer,
        nomeOriginal: nome,
        mimeType: "application/pdf",
        uploadedById: params.uploadedById,
        origemImportacao: "onedrive_legado",
        observacoes: `Importado do ZIP 5.Jurídico (caminho original: ${caminho})`,
      });

      processados++;

      if (!result.ok) {
        erros++;
        detalhes.push({ caminho, status: "erro", erro: result.erro });
      } else if (result.jaExistia) {
        pulados++;
        detalhes.push({
          caminho,
          status: "pulado_duplicata",
          contratoArquivoId: result.contratoArquivoId,
        });
      } else {
        sucessos++;
        detalhes.push({
          caminho,
          status: "sucesso",
          contratoArquivoId: result.contratoArquivoId,
        });
      }
    } catch (e) {
      processados++;
      erros++;
      detalhes.push({ caminho, status: "erro", erro: (e as Error).message });
    }

    // Atualiza job a cada 5 arquivos pra não bombardear o DB
    if (processados % 5 === 0 || processados === pdfEntries.length) {
      await prisma.importJob.update({
        where: { id: params.jobId },
        data: { processados, sucessos, erros, pulados },
      });
    }
  }

  await prisma.importJob.update({
    where: { id: params.jobId },
    data: {
      processados,
      sucessos,
      erros,
      pulados,
      status: "completed",
      finalizadoEm: new Date(),
      duracaoSegundos: Math.round((Date.now() - start) / 1000),
      detalhes: detalhes as unknown as object[],
    },
  });
}
