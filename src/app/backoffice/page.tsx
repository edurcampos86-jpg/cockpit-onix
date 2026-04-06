export const dynamic = "force-dynamic";

import { PageHeader } from "@/components/layout/page-header";

export default function BackofficePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Backoffice"
        description="Painel administrativo"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-lg font-semibold mb-2">Em breve</h3>
          <p className="text-sm text-muted-foreground">
            O painel do Backoffice esta sendo configurado.
          </p>
        </div>
      </div>
    </div>
  );
}
