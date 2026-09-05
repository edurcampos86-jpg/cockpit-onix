import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { isAdmin, isAdminMaster } from "@/lib/rbac-papeis";

export const dynamic = "force-dynamic";

/**
 * Config do sistema — leitura de presença e escrita de QUALQUER chave da tabela
 * Config (DATACRAZY_TOKEN, ANTHROPIC_API_KEY, flags de deploy).
 *
 * O portão anterior tinha três defeitos, todos corrigidos aqui:
 *
 * 1. O segredo comparado era o `SESSION_SECRET` — a chave que ASSINA o JWT de
 *    sessão. Quem o obtivesse não ganhava só esta rota: forjava sessão de
 *    qualquer usuário, com qualquer role. Um segredo de API nunca pode ser a
 *    chave de assinatura da autenticação.
 * 2. Ele era aceito por QUERY STRING (`?secret=...`). Query string vaza para
 *    access log do Railway, log de proxy, histórico do navegador e header
 *    Referer — ou seja, o segredo mais sensível do sistema circulava em texto
 *    puro por quatro lugares que ninguém trata como cofre.
 * 3. Não havia caminho por sessão: nem sendo admin logado dava para usar a
 *    rota sem o segredo em mãos.
 *
 * Agora: sessão de ADMIN, ou o header `x-admin-secret` conferido contra
 * `ADMIN_API_SECRET` (dedicado, comparação timing-safe). Sem `ADMIN_API_SECRET`
 * configurado, o caminho por header simplesmente não existe — falha fechada,
 * e a sessão de admin segue funcionando.
 */

/** Comparação timing-safe de segredos de tamanhos possivelmente diferentes. */
function segredoConfere(recebido: string, esperado: string): boolean {
  // Hash antes de comparar: timingSafeEqual exige buffers do mesmo tamanho, e
  // comparar comprimento primeiro já vazaria o tamanho do segredo.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** O header dedicado — caminho de MÁQUINA, usado pelos scripts de terminal. */
function segredoDeMaquinaConfere(req: NextRequest): boolean {
  const esperado = process.env.ADMIN_API_SECRET?.trim();
  if (!esperado) return false; // falha fechada: sem segredo dedicado, sem atalho
  const recebido = req.headers.get("x-admin-secret");
  return typeof recebido === "string" && segredoConfere(recebido, esperado);
}

/**
 * LEITURA — sessão de admin OU header. Nunca query string.
 *
 * Continua em `isAdmin` de propósito: o GET só diz se a chave EXISTE, nunca
 * devolve o valor. Fechar a leitura em master apagaria capacidade real (saber
 * se a integração está configurada) sem proteger nenhum segredo — é o mesmo
 * critério registrado para `/integracoes` no AGENTS.md.
 */
async function autorizadoParaLer(req: NextRequest): Promise<boolean> {
  const ctx = await getAuthContext().catch(() => null);
  if (ctx && isAdmin(ctx)) return true;
  return segredoDeMaquinaConfere(req);
}

/**
 * ESCRITA — SÓ ADMIN MASTER, ou o header de máquina.
 *
 * Esta rota é o `setConfig` administrativo: é por aqui que flag liga e desliga
 * e que segredo de integração é gravado. A regra do Eduardo põe flags no nível
 * master, e admin comum perde isto.
 *
 * O header CONTINUA valendo, e não é brecha: é o caminho pelo qual os dois
 * scripts de terminal operam, e quem tem `ADMIN_API_SECRET` já tem acesso ao
 * ambiente. Fechar aqui sem fechar lá seria teatro.
 *
 * O gate NÃO foi para `setConfig` (`lib/config-db.ts`), de propósito: aquela
 * função é chamada de dentro de cron — `pixel/metrics.ts`, `integrations/slack.ts`
 * e `api/cron/meta-sync` —, que não tem sessão. Gatear lá quebraria as rotinas
 * em silêncio. O gate pertence à porta administrativa, que é esta.
 */
async function autorizadoParaEscrever(req: NextRequest): Promise<boolean> {
  const ctx = await getAuthContext().catch(() => null);
  if (ctx && isAdminMaster(ctx)) return true;
  return segredoDeMaquinaConfere(req);
}

function negar() {
  return NextResponse.json({ error: "forbidden" }, { status: 403 });
}

/**
 * GET /api/admin/config?key=DATACRAZY_TOKEN
 * Diz se a chave existe — nunca devolve o valor.
 */
export async function GET(req: NextRequest) {
  if (!(await autorizadoParaLer(req))) return negar();

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    // Lista as chaves (sem valores).
    const configs = await prisma.config.findMany({
      select: { key: true, updatedAt: true },
    });
    return NextResponse.json({ keys: configs });
  }

  const config = await prisma.config.findUnique({ where: { key } });
  return NextResponse.json({
    key,
    exists: !!config,
    updatedAt: config?.updatedAt ?? null,
  });
}

/**
 * POST /api/admin/config
 * Body: { key, value } — autorização por sessão de admin ou header.
 */
export async function POST(req: NextRequest) {
  if (!(await autorizadoParaEscrever(req))) return negar();

  const body = await req.json();
  const { key, value } = body;

  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  if (typeof value !== "string") {
    return NextResponse.json({ error: "value must be a string" }, { status: 400 });
  }

  const config = await prisma.config.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });

  console.info(
    `[admin/config] chave ALTERADA · chave=${config.key} · ${new Date().toISOString()}`,
  );

  return NextResponse.json({
    ok: true,
    key: config.key,
    updatedAt: config.updatedAt,
  });
}
