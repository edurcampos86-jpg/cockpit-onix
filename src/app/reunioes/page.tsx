import { plaudConciliacaoUiHabilitada } from "@/lib/reunioes/conciliacao-flag";
import { ReunioesClient } from "./reunioes-client";

export const dynamic = "force-dynamic";

export default async function ReunioesPage() {
  const mesaHabilitada = await plaudConciliacaoUiHabilitada();
  return <ReunioesClient mesaHabilitada={mesaHabilitada} />;
}
