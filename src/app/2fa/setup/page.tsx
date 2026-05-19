import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/layout/page-header";
import { SetupClient } from "./_components/setup-client";

export const metadata = { title: "Configurar 2FA — Cockpit Onix" };
export const dynamic = "force-dynamic";

export default async function Setup2FAPage() {
  const ctx = await getAuthContext().catch(() => null);
  if (!ctx) redirect("/login");

  const perm = await prisma.usuarioPermissao.findUnique({
    where: { userId: ctx.userId },
    select: { twoFactorEnabled: true },
  });
  if (perm?.twoFactorEnabled) {
    redirect("/2fa/verify?next=/juridico/contratos");
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Configurar autenticação em 2 fatores"
        description="Obrigatório para acessar o módulo Jurídico. Use Authy, Google Authenticator ou similar."
      />
      <div className="p-8 max-w-2xl">
        <SetupClient />
      </div>
    </div>
  );
}
