/**
 * Seed da tabela `Empresa` — IDEMPOTENTE.
 *
 * Cria a raiz "Onix Co" e as demais empresas do grupo, TODAS com
 * `parentId = null`. QUEM entra na lista é decisão de
 * `src/lib/empresas/catalogo.ts` (`cadastrada: true`), não deste arquivo —
 * `agro` e `contabil` aparecem no hub e NÃO são semeadas de propósito, porque
 * ainda não existem como operação.
 *
 * ── O QUE ESTE SEED NÃO FAZ ──────────────────────────────────────────────
 * NÃO faz reparenting. Nenhuma empresa passa a apontar para a raiz aqui — isso
 * é PR própria, com conferência antes do UPDATE. Oito raízes soltas é estado
 * VÁLIDO segundo a régua (src/lib/empresas/hierarquia.ts): a validação recusa
 * o terceiro nível, não a ausência do segundo.
 *
 * ── POR QUE É IDEMPOTENTE POR CONSTRUÇÃO ─────────────────────────────────
 * Usa `createMany({ skipDuplicates: true })`: linha cuja PK já existe é
 * ignorada, e nenhuma linha existente é reescrita. Rodar duas vezes não
 * duplica NEM sobrescreve — se alguém já renomeou "Onix Imob" na mão, o nome
 * dele sobrevive ao segundo run. Um `upsert` teria o efeito contrário:
 * devolveria o nome ao valor deste arquivo, apagando a edição em silêncio.
 *
 * Este é o ÚNICO arquivo desta PR que escreve, e escreve só na tabela nova.
 *
 * Como rodar:
 *   npx tsx scripts/seed-empresas.ts
 */
/*
 * Só `dotenv/config` é import estático. O cliente entra por import DINÂMICO
 * dentro de main(), depois do guard de DATABASE_URL: `src/lib/prisma.ts:10`
 * constrói o PrismaClient no momento do import usando
 * `process.env.DATABASE_URL!`, então um import estático faria a falta da
 * variável estourar como erro do driver antes da nossa mensagem.
 *
 * Reusa o singleton da aplicação em vez de montar um cliente próprio: no
 * Prisma 7 o `new PrismaClient()` sem opções LANÇA (é preciso passar o adapter
 * PrismaPg), e duplicar essa fiação aqui seria um segundo lugar para manter.
 * Vários scripts antigos deste repo ainda usam o construtor vazio e falham na
 * construção — não os corrijo nesta PR.
 */
import "dotenv/config";
import { RAIZ_DO_GRUPO, empresasCadastradas } from "../src/lib/empresas/catalogo";

/** Só o contrato de desconexão, para o `finally` não exigir import estático do tipo. */
let clienteAberto: { $disconnect: () => Promise<void> } | null = null;

/**
 * A lista NÃO mora mais aqui: vem de `src/lib/empresas/catalogo.ts`, que é a
 * declaração única de quem existe no grupo e de onde cada uma aparece.
 *
 * Antes era um literal neste arquivo, e foi assim que ele passou a divergir do
 * hub sem ninguém notar — `agro` e `contabil` orbitavam na tela inicial sem
 * nunca terem sido semeadas, `planejamento` era semeada sem aparecer na tela.
 * Um literal só é fonte de verdade enquanto é o ÚNICO; a partir do segundo,
 * vira cópia.
 *
 * Os ids continuam sendo os slugs de `empresas-config.ts` e casam por VALOR com
 * `Implementacao.empresaId`, que já tem linhas em produção — o catálogo
 * documenta isso no tipo.
 */
const EMPRESAS: Array<{ id: string; nome: string }> = empresasCadastradas().map((e) => ({
  id: e.id,
  nome: e.nome,
}));

/** Host de destino sem credencial — a URL do Postgres carrega usuário e senha. */
function descreverDestino(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || "5432"}/${u.pathname.replace(/^\//, "") || "(sem nome)"}`;
  } catch {
    return "(DATABASE_URL não é uma URL válida)";
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL não está definida. Rode a partir da raiz do projeto, com o .env carregado.",
    );
  }
  console.log(`Destino: ${descreverDestino(url)}`);

  const { prisma } = await import("../src/lib/prisma");
  clienteAberto = prisma;

  const antes = await prisma.empresa.count();

  const { count } = await prisma.empresa.createMany({
    data: EMPRESAS.map((e) => ({ id: e.id, nome: e.nome })),
    skipDuplicates: true,
  });

  const depois = await prisma.empresa.count();

  console.log(`\nEmpresas antes:    ${antes}`);
  console.log(`Inseridas agora:   ${count}`);
  console.log(`Empresas depois:   ${depois}`);

  if (count === 0) {
    console.log(`\nNada a fazer — as ${EMPRESAS.length} já existiam. (Rodar de novo é seguro.)`);
  }

  // Conferência: a raiz precisa existir e precisa ser raiz. Se alguém já
  // pendurou a "onix-co" em outra empresa, isso aqui grita — o reparenting
  // desta PR seria justamente o contrário.
  const raiz = await prisma.empresa.findUnique({
    where: { id: RAIZ_DO_GRUPO },
    select: { id: true, nome: true, parentId: true },
  });
  if (!raiz) {
    throw new Error(
      `A raiz "${RAIZ_DO_GRUPO}" não existe após o seed — investigue antes de seguir.`,
    );
  }
  if (raiz.parentId !== null) {
    console.log(
      `\nATENÇÃO: a raiz "${RAIZ_DO_GRUPO}" está com parentId="${raiz.parentId}". ` +
        "Ela deveria ser raiz. Este seed não corrige vínculo — verifique à mão.",
    );
  } else {
    console.log(`\nRaiz confirmada: "${raiz.nome}" (id=${raiz.id}, parentId=null).`);
  }

  const comPai = await prisma.empresa.count({ where: { parentId: { not: null } } });
  console.log(
    `Empresas com pai:  ${comPai}   ` +
      "(esperado 0 nesta fase — o reparenting é PR seguinte.)",
  );
}

main()
  .catch((e) => {
    console.error(`\nERRO: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    // null quando a falha foi antes do import dinâmico (ex.: DATABASE_URL ausente).
    await clienteAberto?.$disconnect().catch(() => {});
  });
