import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { UserCircle, ChevronRight } from "lucide-react";

const PERFIS = [
  {
    slug: "eduardo",
    nome: "Eduardo Campos",
    cargo: "Socio Fundador",
    pat_codigo: "76",
    pat_nome: "Promocional de Acao Livre",
    palavras: ["Sociavel", "Comunicativo", "Flexivel", "Inovador"],
    cor: "from-amber-500/20 to-orange-500/10",
    borda: "border-amber-500/30",
    inicial: "EC",
    inicialCor: "bg-amber-500/20 text-amber-400",
  },
  {
    slug: "thiago",
    nome: "Thiago Vergal",
    cargo: "Consultor Comercial",
    pat_codigo: "22",
    pat_nome: "Projetista Criativo",
    palavras: ["Independente", "Analitico", "Ousado", "Empreendedor"],
    cor: "from-blue-500/20 to-cyan-500/10",
    borda: "border-blue-500/30",
    inicial: "TV",
    inicialCor: "bg-blue-500/20 text-blue-400",
  },
  {
    slug: "rose",
    nome: "Rosilene Oliveira",
    cargo: "Consultora Senior",
    pat_codigo: "118",
    pat_nome: "Intro-Diligente Livre",
    palavras: ["Atenciosa", "Bom ouvinte", "Estavel", "Flexivel"],
    cor: "from-purple-500/20 to-pink-500/10",
    borda: "border-purple-500/30",
    inicial: "RO",
    inicialCor: "bg-purple-500/20 text-purple-400",
  },
];

export default function PerfisPage() {
  return (
    <div className="min-h-screen">
      <PageHeader
        title="Perfis do Time"
        description="Perfis comportamentais PAT — base para coaching e desenvolvimento semanal"
      />

      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PERFIS.map((p) => (
            <Link
              key={p.slug}
              href={`/onix-corretora/perfis/${p.slug}`}
              className={`group rounded-2xl border ${p.borda} bg-gradient-to-br ${p.cor} p-6 hover:scale-[1.02] transition-all duration-200`}
            >
              <div className="flex items-center gap-4 mb-5">
                <div className={`w-14 h-14 rounded-full ${p.inicialCor} flex items-center justify-center text-lg font-bold shrink-0`}>
                  {p.inicial}
                </div>
                <div>
                  <h2 className="font-bold text-base">{p.nome}</h2>
                  <p className="text-xs text-muted-foreground">{p.cargo}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Perfil PAT</p>
                <p className="text-sm font-semibold">
                  <span className="text-primary">#{p.pat_codigo}</span>
                  {" "}— {p.pat_nome}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-5">
                {p.palavras.map((w) => (
                  <span
                    key={w}
                    className="text-[10px] px-2 py-0.5 rounded-full border border-border bg-background/40 text-muted-foreground"
                  >
                    {w}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-end text-xs text-primary font-medium gap-1 group-hover:gap-2 transition-all">
                Ver perfil completo
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
