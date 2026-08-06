import "server-only";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";

/**
 * Sincroniza o estado dos PRs vinculados a sugestões da Central de
 * Implementações.
 *
 * Por que existe: `prStatus` é gravado à mão no momento em que o PR é
 * vinculado — quase sempre "aberta". Ninguém volta na tela dias depois para
 * marcar "merged", então sem esta sincronia a métrica de lead time só enxerga
 * os PRs que alguém lembrou de atualizar, e o buraco cresce com o uso.
 *
 * DEGRADAÇÃO LIMPA: sem token configurado, a função não é erro — ela responde
 * `configurado: false` e não faz nada. O vínculo manual continua funcionando
 * exatamente como antes; a sincronia é conveniência, não dependência. Isso
 * também evita transformar um segredo novo em requisito de deploy.
 *
 * Só LÊ do GitHub. Não comenta, não fecha, não mergeia nada.
 */

/** Repositório assumido quando o vínculo tem só o número, sem URL. */
const REPO_PADRAO = "edurcampos86-jpg/cockpit-onix";

/** Teto de PRs por execução — cron de 30min não precisa varrer o mundo. */
const MAX_POR_RODADA = 50;

export type PrSyncResult = {
  configurado: boolean;
  verificados: number;
  atualizados: number;
  falhas: number;
  detalhe?: string;
};

/** "https://github.com/dono/repo/pull/12" → "dono/repo". null se não der. */
export function repoDaUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+\/[^/]+)\/pull\/\d+/i);
  return m ? m[1] : null;
}

/**
 * Traduz o par (state, merged_at) da API do GitHub para o vocabulário daqui.
 *
 * O GitHub não tem estado "merged": um PR mergeado vem como `state: "closed"`
 * com `merged_at` preenchido. Tratar só o `state` marcaria todo PR entregue
 * como "fechada" — e a métrica de entrega contaria zero.
 */
export function traduzirEstadoPr(
  state: string,
  mergedAt: string | null,
): { status: "aberta" | "merged" | "fechada"; mergedAt: Date | null } {
  if (mergedAt) return { status: "merged", mergedAt: new Date(mergedAt) };
  if (state === "open") return { status: "aberta", mergedAt: null };
  return { status: "fechada", mergedAt: null };
}

export async function sincronizarStatusPrs(): Promise<PrSyncResult> {
  const token = await getConfig("GITHUB_TOKEN");
  if (!token) {
    return {
      configurado: false,
      verificados: 0,
      atualizados: 0,
      falhas: 0,
      detalhe: "GITHUB_TOKEN não configurado — sincronia desligada.",
    };
  }
  const repoConfig = (await getConfig("GITHUB_REPO")) || REPO_PADRAO;

  // Só o que ainda pode mudar. PR já "merged" ou "fechada" é estado terminal —
  // reconsultá-lo a cada 30min gastaria rate limit para confirmar o óbvio.
  const pendentes = await prisma.implementacao.findMany({
    where: { prNumero: { not: null }, prStatus: "aberta" },
    select: { id: true, prNumero: true, prUrl: true },
    orderBy: { updatedAt: "asc" },
    take: MAX_POR_RODADA,
  });

  let atualizados = 0;
  let falhas = 0;

  for (const impl of pendentes) {
    // O repo sai da própria URL quando ela existe: se um dia houver sugestão
    // apontando para outro repositório, ela não é lida contra o repo padrão.
    const repo = repoDaUrl(impl.prUrl) ?? repoConfig;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls/${impl.prNumero}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
        },
      );

      // 404 = PR apagado ou repo errado. Não é falha transitória e não adianta
      // repetir a cada 30min: o vínculo fica como está e o humano corrige.
      if (res.status === 404) continue;
      if (!res.ok) {
        falhas++;
        continue;
      }

      const pr = (await res.json()) as {
        state?: string;
        merged_at?: string | null;
        html_url?: string;
      };
      const { status, mergedAt } = traduzirEstadoPr(
        pr.state ?? "open",
        pr.merged_at ?? null,
      );
      if (status === "aberta") continue; // nada mudou

      await prisma.implementacao.update({
        where: { id: impl.id },
        data: {
          prStatus: status,
          // A data vem do GITHUB, não do relógio da sincronia: um PR mergeado
          // ontem e sincronizado hoje precisa da data de ontem, senão o lead
          // time incorpora o atraso do cron.
          prMergedAt: mergedAt,
          // Preenche a URL para quem vinculou só pelo número — o link na tela
          // passa a existir sem ninguém digitar.
          ...(impl.prUrl ? {} : { prUrl: pr.html_url ?? null }),
        },
      });
      atualizados++;
    } catch {
      falhas++;
    }
  }

  return {
    configurado: true,
    verificados: pendentes.length,
    atualizados,
    falhas,
  };
}
