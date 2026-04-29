import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ComoFunciona } from "@/components/layout/como-funciona";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./change-password-form";
import { TwoFactorCard } from "@/components/two-factor/two-factor-card";

export default async function ConfiguracoesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { totpEnabled: true },
  });
  const totpEnabled = user?.totpEnabled ?? false;

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta e preferências"
      />

      <div className="mt-8 space-y-8">
        <ComoFunciona
          proposito="Sua conta no Cockpit: senha de acesso e verificação em duas etapas."
          comoUsar="Use uma senha de pelo menos 12 caracteres com letras e números, e ative a verificação em duas etapas (2FA) com um app autenticador."
          comoAjuda="Mantém o acesso seguro ao seu Cockpit, que concentra dados sensíveis de carteira, leads e operação."
        />

        <ChangePasswordForm />

        <TwoFactorCard enabled={totpEnabled} />

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-accent/30">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Segurança</h2>
              <p className="text-xs text-muted-foreground">
                Dicas para manter sua conta segura
              </p>
            </div>
          </div>

          <div className="p-6">
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#x2022;</span>
                Use senha única para o Cockpit; nunca reaproveite de outros sites.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#x2022;</span>
                Ative a verificação em duas etapas com um app autenticador.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#x2022;</span>
                Guarde os códigos de recuperação em um cofre de senhas confiável.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-0.5">&#x2022;</span>
                Nunca compartilhe suas credenciais — nem com colegas, nem com o suporte.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
