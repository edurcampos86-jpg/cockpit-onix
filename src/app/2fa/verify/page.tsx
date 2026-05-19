import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { verificarSessao2FA } from "@/lib/auth/session-2fa";
import { PageHeader } from "@/components/layout/page-header";
import { VerifyClient } from "./_components/verify-client";

export const metadata = { title: "Verificar 2FA — Cockpit Onix" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string }>;

export default async function Verify2FAPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const params = await searchParams;
  const nextUrl = params.next || "/juridico/contratos";

  const perm = await prisma.usuarioPermissao.findUnique({
    where: { userId: ctx.userId },
    select: { twoFactorEnabled: true },
  });

  // Se ainda não configurou, manda pra setup
  if (!perm?.twoFactorEnabled) {
    redirect(`/2fa/setup?next=${encodeURIComponent(nextUrl)}`);
  }

  // Já tá verificado nessa sessão → vai direto
  if (await verificarSessao2FA(ctx.userId)) {
    redirect(nextUrl);
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Verificação 2FA"
        description="Digite o código atual do seu app authenticator para continuar."
      />
      <div className="p-8 max-w-md">
        <VerifyClient nextUrl={nextUrl} />
      </div>
    </div>
  );
}
