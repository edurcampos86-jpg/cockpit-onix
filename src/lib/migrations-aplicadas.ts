/**
 * Qual schema está no ar — o par que faltava de `versao-deploy.ts`.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * Enquanto `prisma migrate deploy` vivia dentro do `startCommand`, migrar e
 * subir eram a mesma coisa: se o app respondia, o schema estava aplicado. Isso
 * era caro (uma migration que falhava derrubava o serviço) e por isso mudou —
 * a migration agora é o `preDeployCommand` do `railway.toml`.
 *
 * A separação criou um estado que ANTES NÃO EXISTIA: app no ar com schema
 * velho. Ele aparece quando o `preDeployCommand` não é lido (config errada),
 * quando alguém roda a imagem à mão (o `CMD` do Dockerfile não migra), ou num
 * rollback que volta o container sem voltar o banco.
 *
 * Esse estado é silencioso do jeito pior: `SELECT 1` responde, o health fica
 * verde, e o erro aparece depois, como coluna inexistente no meio de uma
 * requisição de usuário. Este módulo troca isso por um número no `/api/health`.
 *
 * ── O QUE É COMPARADO ────────────────────────────────────────────────────
 * As pastas em `prisma/migrations/` (o que o CÓDIGO no ar espera) contra
 * `_prisma_migrations` (o que o BANCO tem). A diferença é a resposta:
 *
 *   pendentes > 0  → o código no ar espera schema que o banco não tem
 *   falhas   > 0   → migration que começou e não terminou, ou revertida
 *
 * A tabela `_prisma_migrations` é lida por SQL cru, e não pelo cliente
 * tipado, porque ela não está no `schema.prisma` — é interna do Prisma.
 */
/*
 * Sem `server-only`, pelo mesmo motivo de `versao-deploy.ts`: o pacote estoura
 * fora do bundler do Next, e `npm test` roda em `tsx --test`. A comparação é
 * pura e é justamente o que precisa de teste. O acoplamento ao servidor já
 * está garantido por outro caminho — `node:fs` não existe no cliente, então um
 * import acidental num componente de browser quebra no build, não em produção.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

export type LinhaMigration = {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export type EstadoMigrations = {
  /** Nome da última migration concluída. `null` em banco sem nenhuma. */
  ultima: string | null;
  /** Quando ela terminou, em ISO. */
  aplicadaEm: string | null;
  /** Quantas concluíram com sucesso. */
  aplicadas: number;
  /**
   * Migrations no disco que o banco não tem. **É este o número que importa:**
   * > 0 significa código no ar esperando schema que não existe.
   */
  pendentes: string[];
  /** Começaram e não terminaram, ou foram revertidas. Exige olho humano. */
  falhas: string[];
};

/**
 * A comparação, PURA — sem banco e sem disco, para ser testável.
 *
 * `noDisco` são os nomes das pastas de `prisma/migrations/`; `noBanco` são as
 * linhas de `_prisma_migrations`. Uma migration conta como aplicada só quando
 * `finished_at` está preenchido E `rolled_back_at` não está: linha começada e
 * não terminada é falha, não sucesso, e tratá-la como aplicada esconderia
 * exatamente o caso em que o schema ficou pela metade.
 */
export function compararMigrations(
  noDisco: readonly string[],
  noBanco: readonly LinhaMigration[],
): EstadoMigrations {
  const concluidas = noBanco.filter(
    (m) => m.finished_at !== null && m.rolled_back_at === null,
  );
  const nomesConcluidos = new Set(concluidas.map((m) => m.migration_name));

  // Ordem cronológica: o nome de migration do Prisma começa com timestamp, então
  // ordenar por nome é ordenar por tempo — e não depende de `finished_at`, que
  // num restore vem todo com a mesma marca.
  const ultimaLinha = [...concluidas].sort((a, b) =>
    a.migration_name.localeCompare(b.migration_name),
  ).at(-1);

  return {
    ultima: ultimaLinha?.migration_name ?? null,
    aplicadaEm: ultimaLinha?.finished_at?.toISOString() ?? null,
    aplicadas: concluidas.length,
    pendentes: [...noDisco].filter((nome) => !nomesConcluidos.has(nome)).sort(),
    falhas: noBanco
      .filter((m) => m.finished_at === null || m.rolled_back_at !== null)
      .map((m) => m.migration_name)
      .sort(),
  };
}

/** As pastas de `prisma/migrations/`, sem `migration_lock.toml` e afins. */
export async function migrationsNoDisco(
  raiz = path.join(process.cwd(), "prisma", "migrations"),
): Promise<string[]> {
  const entradas = await readdir(raiz, { withFileTypes: true });
  return entradas
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

type ClientePrisma = {
  $queryRawUnsafe: <T>(sql: string) => Promise<T>;
};

/**
 * O estado real: lê o disco e o banco e compara.
 *
 * `$queryRawUnsafe` com string literal fixa — não há interpolação de entrada
 * nenhuma aqui, e o template tag normal (`$queryRaw`) não é usado só porque a
 * tabela tem underscore inicial e o nome precisa sair sem aspas do Prisma.
 */
export async function lerEstadoMigrations(
  prisma: ClientePrisma,
): Promise<EstadoMigrations> {
  const [noDisco, noBanco] = await Promise.all([
    migrationsNoDisco(),
    prisma.$queryRawUnsafe<LinhaMigration[]>(
      'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"',
    ),
  ]);
  return compararMigrations(noDisco, noBanco);
}
