/**
 * Endpoint admin temporário pra rodar `prisma migrate resolve --applied <name>`
 * em prod. Necessário porque o Railway dashboard não expõe Shell e o DB de prod
 * é internal (sem TCP proxy público).
 *
 * Uso (curl com cookie de admin):
 *   curl -X POST https://cockpit-onix-production.up.railway.app/api/admin/migrate-resolve \
 *     -H "Content-Type: application/json" \
 *     -b "session=..." \
 *     -d '{"migration":"20260518180000_baseline"}'
 *
 * O nome da migration vem do body e passa por regex pra evitar shell injection.
 * Deve ser removido logo após uso — PR de cleanup.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getAuthContext, isAdmin } from "@/lib/auth-helpers";

const execAsync = promisify(exec);

const ALLOWED_NAME = /^[A-Za-z0-9_-]+$/;

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (!isAdmin(ctx)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: { migration?: string };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const migration = payload?.migration;
  if (!migration || !ALLOWED_NAME.test(migration)) {
    return Response.json(
      { error: "migration name missing or contains invalid chars" },
      { status: 400 },
    );
  }

  try {
    const { stdout, stderr } = await execAsync(
      `npx --yes prisma migrate resolve --applied ${migration}`,
      { timeout: 60_000 },
    );
    return Response.json({ ok: true, stdout, stderr });
  } catch (e) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    return Response.json(
      {
        ok: false,
        error: err.message,
        stdout: err.stdout,
        stderr: err.stderr,
      },
      { status: 500 },
    );
  }
}
