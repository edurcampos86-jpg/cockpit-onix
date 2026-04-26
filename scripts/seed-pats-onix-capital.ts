/**
 * Processa os PDFs de PAT da Criativa Humana enviados pelo Eduardo (jul/2025)
 * e cria registros Pat no banco para os sócios já cadastrados.
 *
 * - Lê PDFs do diretório iCloud
 * - Para cada um: identifica a pessoa pelo nome do arquivo (matching contra Pessoa.nomeCompleto)
 * - Se a pessoa existe: chama Claude pra extrair + salva no banco
 * - Se a pessoa NÃO existe: lista como pendente (Eduardo cadastra depois)
 *
 * Idempotente: pula se já existe Pat com mesma dataPat pra mesma pessoa.
 *
 * Uso: npx tsx scripts/seed-pats-onix-capital.ts
 */

import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { extrairPat } from "../src/lib/integrations/pat";
import * as fs from "node:fs";
import * as path from "node:path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PAT_DIR =
  "C:\\Users\\edurc\\iCloudDrive\\Onix Co\\Onix Investimentos\\GESTAO E PERFORMANCE\\Teste de Perfil Jul.2025";

/**
 * Normaliza nome para matching: minúsculas, sem acentos, sem múltiplos espaços.
 */
function normNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrai o nome do arquivo "PAT Executive - NOME PESSOA.pdf"
 */
function nomeDoArquivo(filename: string): string {
  const m = filename.match(/^PAT Executive\s*-\s*(.+?)(?:\s*\d+)?\.pdf$/i);
  return m ? m[1].trim() : filename.replace(/\.pdf$/i, "");
}

async function main() {
  console.log("🌱 PATs da Onix — extração via Claude\n");

  if (!fs.existsSync(PAT_DIR)) {
    throw new Error(`Diretório não existe: ${PAT_DIR}`);
  }

  // Lista PDFs (deduplicar por nome de pessoa)
  const arquivos = fs
    .readdirSync(PAT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));

  // Deduplica: prefere o sem sufixo " 2"
  const dedupMap = new Map<string, string>(); // chave: nome normalizado | valor: filename
  for (const f of arquivos) {
    const nome = nomeDoArquivo(f);
    const key = normNome(nome);
    const existing = dedupMap.get(key);
    if (!existing || /\s\d+\.pdf$/i.test(existing)) {
      dedupMap.set(key, f);
    }
  }

  console.log(`📄 ${arquivos.length} arquivos brutos → ${dedupMap.size} únicos\n`);

  // Carregar todas pessoas pra match
  const pessoas = await prisma.pessoa.findMany({
    where: { status: "ativo" },
    select: { id: true, nomeCompleto: true, apelido: true },
  });

  const pessoaPorNome = new Map<string, (typeof pessoas)[number]>();
  for (const p of pessoas) {
    pessoaPorNome.set(normNome(p.nomeCompleto), p);
  }

  type Resultado = {
    arquivo: string;
    nome: string;
    status: "ok" | "ja_existe" | "pessoa_nao_existe" | "erro";
    pessoaId?: string;
    dataPat?: string;
    perspectiva?: string | null;
    ambiente?: string | null;
    erroMsg?: string;
  };

  const resultados: Resultado[] = [];
  const pendentes: string[] = [];

  for (const [keyNome, filename] of dedupMap) {
    const nomeOriginal = nomeDoArquivo(filename);
    const pessoa = pessoaPorNome.get(keyNome);

    if (!pessoa) {
      pendentes.push(nomeOriginal);
      resultados.push({
        arquivo: filename,
        nome: nomeOriginal,
        status: "pessoa_nao_existe",
      });
      continue;
    }

    // OTIMIZAÇÃO: pula ANTES de chamar Claude se a pessoa já tem PAT extraído
    // (anteriormente o script chamava Claude sempre e só depois checava — desperdiçando créditos)
    const patExistente = await prisma.pat.findFirst({
      where: { pessoaId: pessoa.id, status: "extraido" },
      select: { id: true, dataPat: true },
    });
    if (patExistente) {
      console.log(
        `↻ ${pessoa.apelido || pessoa.nomeCompleto} — ja tem PAT extraido (${patExistente.dataPat.toISOString().slice(0, 10)}), pulando sem chamar Claude`,
      );
      resultados.push({
        arquivo: filename,
        nome: nomeOriginal,
        status: "ja_existe",
        pessoaId: pessoa.id,
        dataPat: patExistente.dataPat.toISOString().slice(0, 10),
      });
      continue;
    }

    // Lê PDF (com retry pra forçar download iCloud se necessário)
    const fullPath = path.join(PAT_DIR, filename);
    let buf: Buffer;
    try {
      buf = fs.readFileSync(fullPath);
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`  ✗ ERRO ao ler PDF (${pessoa.apelido}): ${msg.slice(0, 200)}`);
      resultados.push({
        arquivo: filename,
        nome: nomeOriginal,
        status: "erro",
        pessoaId: pessoa.id,
        erroMsg: `Falha ao ler PDF do iCloud: ${msg.slice(0, 300)}`,
      });
      continue;
    }
    const pdfBase64 = buf.toString("base64");

    console.log(
      `→ ${pessoa.apelido || pessoa.nomeCompleto} (${(buf.length / 1024).toFixed(0)} KB) — chamando Claude...`,
    );

    let extracao;
    try {
      extracao = await extrairPat(pdfBase64);
    } catch (e) {
      const msg = (e as Error).message;
      console.log(`  ✗ ERRO: ${msg.slice(0, 200)}`);
      resultados.push({
        arquivo: filename,
        nome: nomeOriginal,
        status: "erro",
        pessoaId: pessoa.id,
        erroMsg: msg.slice(0, 500),
      });
      // Cria registro mesmo assim com status erro pra ficar rastreável
      await prisma.pat.create({
        data: {
          pessoaId: pessoa.id,
          filename,
          pdfBase64,
          bytes: buf.length,
          dataPat: new Date(),
          status: "erro",
          erroMensagem: msg.slice(0, 500),
        },
      });
      // Se for erro de saldo da Anthropic, para o script (não adianta tentar os próximos)
      if (msg.includes("credit balance is too low")) {
        console.log("\n⛔ Saldo da Anthropic esgotado. Parando.");
        break;
      }
      continue;
    }

    const dataPat = extracao.dataPat ? new Date(extracao.dataPat) : new Date();

    // Verifica se já existe Pat pra essa pessoa+data
    const ja = await prisma.pat.findFirst({
      where: {
        pessoaId: pessoa.id,
        dataPat,
      },
      select: { id: true },
    });

    if (ja) {
      console.log(`  ↻ ja existe Pat pra ${dataPat.toISOString().slice(0, 10)} — pulando`);
      resultados.push({
        arquivo: filename,
        nome: nomeOriginal,
        status: "ja_existe",
        pessoaId: pessoa.id,
        dataPat: dataPat.toISOString().slice(0, 10),
      });
      continue;
    }

    await prisma.pat.create({
      data: {
        pessoaId: pessoa.id,
        filename,
        pdfBase64,
        bytes: buf.length,
        dataPat,
        status: "extraido",
        perspectiva: extracao.perspectiva,
        ambienteCelula: extracao.ambienteCelula,
        ambienteNome: extracao.ambienteNome,
        orientacao: extracao.orientacao,
        aproveitamento: extracao.aproveitamento,
        principaisCompetencias: extracao.principaisCompetencias,
        caracteristicas: extracao.caracteristicas,
        estrutural: extracao.estrutural ?? undefined,
        iconeEstrutural: extracao.iconeEstrutural ?? undefined,
        tendencias: extracao.tendencias ?? undefined,
        risco: extracao.risco ?? undefined,
        competenciasEstrategicas: extracao.competenciasEstrategicas,
        ambiente: extracao.ambiente ?? undefined,
        resumido: extracao.resumido,
        detalhado: extracao.detalhado,
        sugestoes: extracao.sugestoes,
        gerencial: extracao.gerencial,
      },
    });

    console.log(
      `  ✓ ${dataPat.toISOString().slice(0, 10)} | Persp:${extracao.perspectiva} | ${extracao.ambienteNome} | ${extracao.orientacao}`,
    );
    resultados.push({
      arquivo: filename,
      nome: nomeOriginal,
      status: "ok",
      pessoaId: pessoa.id,
      dataPat: dataPat.toISOString().slice(0, 10),
      perspectiva: extracao.perspectiva,
      ambiente: extracao.ambienteNome,
    });
  }

  // Relatório final
  const ok = resultados.filter((r) => r.status === "ok");
  const jaExiste = resultados.filter((r) => r.status === "ja_existe");
  const erros = resultados.filter((r) => r.status === "erro");

  console.log("\n📊 Resumo:");
  console.log(`  ✓ ${ok.length} PATs extraídos com sucesso`);
  console.log(`  ↻ ${jaExiste.length} já existiam (pulados)`);
  console.log(`  ✗ ${erros.length} erros`);
  console.log(`  ⚠ ${pendentes.length} pessoas não cadastradas no time`);

  if (pendentes.length > 0) {
    console.log("\n⚠ Pessoas dos PDFs que NÃO estão cadastradas em /time:");
    for (const p of pendentes) console.log(`     - ${p}`);
  }

  if (erros.length > 0) {
    console.log("\n✗ Erros:");
    for (const e of erros) console.log(`     - ${e.nome}: ${e.erroMsg}`);
  }
}

main()
  .catch((e) => {
    console.error("FALHOU:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
