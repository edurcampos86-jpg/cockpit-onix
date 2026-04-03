export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import Link from "next/link";
import { ArrowLeft, Star, AlertTriangle, MessageSquare, Zap, Heart } from "lucide-react";
import { prisma } from "@/lib/prisma";

// Dados PAT estaticos por vendedor
const PERFIS_PAT: Record<string, {
  nome_completo: string;
  cargo: string;
  pat_codigo: string;
  pat_nome: string;
  palavras_chave: string[];
  principais_competencias: string[];
  essencia: string;
  pontos_fortes_atendimento: string[];
  pontos_de_atencao_atendimento: string[];
  sob_pressao: string;
  como_dar_feedback: string;
  cor: string;
  borda: string;
  inicial: string;
  inicialCor: string;
  nomeRelatorio: string;
}> = {
  eduardo: {
    nome_completo: "Eduardo Rodrigues Campos",
    cargo: "Socio Fundador",
    pat_codigo: "76",
    pat_nome: "Promocional de Acao Livre",
    palavras_chave: ["Sociavel", "Comunicativo", "Rapido", "Orientado para acao", "Flexivel", "Inovador"],
    principais_competencias: ["Relacionamento interpessoal", "Foco no cliente", "Flexibilidade"],
    essencia: "Eduardo tem uma habilidade natural de criar conexao com as pessoas, comunicar-se de forma fluente e entusiasmante e fazer o cliente sentir que esta sendo ouvido. Seu estilo e envolvente, informal e persuasivo, o que cria um ambiente de leveza ideal para o atendimento comercial.",
    pontos_fortes_atendimento: [
      "Cria vinculo emocional com o cliente rapidamente — o cliente se sente especial e unico",
      "Linguagem natural, afavel e descomplicada — reduz barreiras e objecoes iniciais com facilidade",
      "Alta energia e entusiasmo contagiante — transmite seguranca e positividade no produto",
      "Capaz de improvisar e conduzir conversas em qualquer direcao sem perder o fio",
    ],
    pontos_de_atencao_atendimento: [
      "Conecta-se rapidamente mas tambem desapega com facilidade — pode deixar leads abertos sem follow-up",
      "Interesse pequeno nos detalhes — informacoes tecnicas importantes podem escapar",
      "Preferencia pelo macro pode deixar o cliente sem clareza nos proximos passos",
      "Tendencia a iniciar muitas frentes sem concluir — pode comprometer a taxa de conversao",
    ],
    sob_pressao: "Quando muito pressionado, pode experimentar fantasias negativas — sente que os outros nao se importam com ele. Pode se tornar menos funcional se sentir falta de reconhecimento.",
    como_dar_feedback: "Use linguagem energetica e direta. Reconheca o estilo e a conexao criada antes de sugerir ajustes. Enquadre melhorias como 'turbinar o que ja funciona', nunca como critica. Evite tabelas, dados frios ou linguagem burocratica.",
    cor: "from-amber-500/10 to-orange-500/5",
    borda: "border-amber-500/30",
    inicial: "EC",
    inicialCor: "bg-amber-500/20 text-amber-400",
    nomeRelatorio: "Eduardo Campos",
  },
  thiago: {
    nome_completo: "Thiago Moreira Vergal",
    cargo: "Consultor Comercial",
    pat_codigo: "22",
    pat_nome: "Projetista Criativo",
    palavras_chave: ["Independente", "Pensador", "Impaciente", "Inovador", "Criativo", "Ousado", "Empreendedor"],
    principais_competencias: ["Empreendedorismo", "Tomada de decisao", "Visao sistemica"],
    essencia: "Thiago age com autonomia e confianca, resolve problemas complexos com logica e velocidade, e nao recua diante de desafios. Sua abordagem e tecnica, direta e orientada a resultados — o que gera credibilidade imediata com clientes mais racionais e exigentes.",
    pontos_fortes_atendimento: [
      "Resolve duvidas tecnicas com precisao e seguranca — transmite credibilidade instantanea",
      "Direto ao ponto, sem enrolacao — clientes objetivos apreciam e confiam mais rapido",
      "Assumir riscos calculados: nao hesita em fazer uma proposta arrojada quando ve oportunidade",
      "Autonomia na tomada de decisao — nao precisa de aprovacao para avancar com o cliente",
    ],
    pontos_de_atencao_atendimento: [
      "Comunicacao muito sucinta pode deixar clientes emocionais sem conexao ou contexto suficiente",
      "Impaciencia pode transparecer quando o cliente demora a decidir — cria tensao desnecessaria",
      "Dificuldade em adaptar linguagem tecnica para perfis menos racionais — pode perder o lead",
      "Pouca inclinacao para perguntas pessoais — clientes que precisam de escuta podem se sentir ignorados",
    ],
    sob_pressao: "Quando muito pressionado, pode ter explosoes emocionais inadequadas que constrangem o ambiente. Pode se tornar intimidatorio sem perceber.",
    como_dar_feedback: "Seja direto e objetivo. Apresente dados e metricas sempre que possivel. Enquadre ajustes como otimizacoes de performance, nao como questoes comportamentais. Desafie com benchmarks — isso o motiva. Evite redundancias e mensagens longas.",
    cor: "from-blue-500/10 to-cyan-500/5",
    borda: "border-blue-500/30",
    inicial: "TV",
    inicialCor: "bg-blue-500/20 text-blue-400",
    nomeRelatorio: "Thiago Vergal",
  },
  rose: {
    nome_completo: "Rosilene Oliveira dos Santos",
    cargo: "Consultora Senior",
    pat_codigo: "118",
    pat_nome: "Intro-Diligente Livre",
    palavras_chave: ["Paciente", "Atenciosa", "Bom ouvinte", "Discreta", "Estavel", "Flexivel", "Imaginativa"],
    principais_competencias: ["Flexibilidade", "Relacionamento interpessoal", "Criatividade corporativa"],
    essencia: "Rose constroi relacoes com profundidade e cuidado genuino. Sua escuta ativa e paciencia criam um espaco de confianca que muitos clientes raramente encontram. Trabalha com dedicacao quando tem clareza do que e esperado e se sente apoiada.",
    pontos_fortes_atendimento: [
      "Escuta ativa genuina — o cliente sente que esta sendo realmente ouvido, nao apenas atendido",
      "Cria relacoes de longo prazo com fidelidade — clientes que ja compraram tendem a voltar",
      "Gentileza e atencao humanizam o atendimento comercial, gerando confianca organica",
      "Trabalha com energia e dedicacao quando acredita no que esta fazendo",
    ],
    pontos_de_atencao_atendimento: [
      "Ritmo mais compassado pode ser lento em situacoes que exigem resposta rapida do cliente",
      "Dificuldade em ser firme quando necessario — pode evitar conversas diretas sobre objecoes",
      "Suporte a pressao muito baixo (15%) — acumulo de demandas pode impactar qualidade do atendimento",
      "Pode nao enxergar oportunidades de ampliar a negociacao por nao querer 'incomodar' o cliente",
    ],
    sob_pressao: "Quando muito pressionada, pode se tornar excessivamente insegura, desmotivada e, em casos extremos, hostil. E importante que Rose tenha clareza de metas e apoio da lideranca antes que isso aconteca.",
    como_dar_feedback: "SEMPRE reconheca o esforco e o cuidado ANTES de qualquer sugestao. Use linguagem gentil, concreta e passo a passo. NUNCA use urgencia ou compare com colegas. Enquadre ajustes como 'uma ideia para experimentar'. Celebre conquistas pequenas.",
    cor: "from-purple-500/10 to-pink-500/5",
    borda: "border-purple-500/30",
    inicial: "RO",
    inicialCor: "bg-purple-500/20 text-purple-400",
    nomeRelatorio: "Rose Oliveira",
  },
};

export default async function PerfilVendedorPage({
  params,
}: {
  params: Promise<{ vendedor: string }>;
}) {
  const { vendedor } = await params;
  const perfil = PERFIS_PAT[vendedor];
  if (!perfil) notFound();

  // Ultimos 3 relatorios do vendedor
  const relatorios = await prisma.relatorio.findMany({
    where: { vendedor: perfil.nomeRelatorio },
    orderBy: { periodoInicio: "desc" },
    take: 3,
    select: { id: true, periodo: true, metricas: { select: { score: true } } },
  });

  const scoreMedio = relatorios.filter(r => r.metricas?.score && r.metricas.score > 0).length > 0
    ? Math.round(
        relatorios
          .filter(r => r.metricas?.score && r.metricas.score > 0)
          .reduce((acc, r) => acc + (r.metricas?.score ?? 0), 0) /
        relatorios.filter(r => r.metricas?.score && r.metricas.score > 0).length
      )
    : null;

  return (
    <div className="min-h-screen">
      <PageHeader
        title={perfil.nome_completo}
        description={`${perfil.cargo} · PAT ${perfil.pat_codigo} — ${perfil.pat_nome}`}
      >
        <Link
          href="/onix-corretora/perfis"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Todos os perfis
        </Link>
      </PageHeader>

      <div className="p-8 space-y-6">
        {/* Cabecalho do perfil */}
        <div className={`rounded-2xl border ${perfil.borda} bg-gradient-to-br ${perfil.cor} p-6`}>
          <div className="flex items-start gap-5">
            <div className={`w-16 h-16 rounded-full ${perfil.inicialCor} flex items-center justify-center text-xl font-bold shrink-0`}>
              {perfil.inicial}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold">{perfil.nome_completo}</h2>
                <span className="text-xs px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary font-semibold">
                  PAT {perfil.pat_codigo}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">{perfil.pat_nome}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {perfil.palavras_chave.map((w) => (
                  <span key={w} className="text-[11px] px-2 py-0.5 rounded-full bg-background/50 border border-border text-muted-foreground">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            {scoreMedio !== null && (
              <div className="text-center shrink-0">
                <div className={`text-3xl font-bold ${scoreMedio >= 80 ? "text-green-400" : scoreMedio >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                  {scoreMedio}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">score medio</div>
              </div>
            )}
          </div>

          <p className="mt-5 text-sm text-foreground/85 leading-relaxed border-t border-border/30 pt-4">
            {perfil.essencia}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {perfil.principais_competencias.map((c) => (
              <span key={c} className="text-xs px-3 py-1 rounded-full bg-primary/15 text-primary font-medium">
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pontos fortes */}
          <div className="rounded-xl border border-green-400/20 bg-green-400/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-4 w-4 text-green-400 shrink-0" />
              <h3 className="font-semibold text-sm text-green-400">Pontos Fortes no Atendimento</h3>
            </div>
            <ul className="space-y-3">
              {perfil.pontos_fortes_atendimento.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="w-5 h-5 rounded-full bg-green-400/20 text-green-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground/85 leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Pontos de atencao */}
          <div className="rounded-xl border border-yellow-400/20 bg-yellow-400/5 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
              <h3 className="font-semibold text-sm text-yellow-400">Pontos de Atencao</h3>
            </div>
            <ul className="space-y-3">
              {perfil.pontos_de_atencao_atendimento.map((p, i) => (
                <li key={i} className="flex gap-2.5 text-sm">
                  <span className="w-5 h-5 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-foreground/85 leading-relaxed">{p}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Sob pressao */}
          <div className="rounded-xl border border-red-400/20 bg-red-400/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-red-400 shrink-0" />
              <h3 className="font-semibold text-sm text-red-400">Sob Pressao</h3>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{perfil.sob_pressao}</p>
          </div>

          {/* Como dar feedback */}
          <div className="rounded-xl border border-blue-400/20 bg-blue-400/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-blue-400 shrink-0" />
              <h3 className="font-semibold text-sm text-blue-400">Como Dar Feedback</h3>
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">{perfil.como_dar_feedback}</p>
          </div>
        </div>

        {/* Historico de relatorios */}
        {relatorios.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-primary shrink-0" />
              <h3 className="font-semibold text-sm">Ultimos Relatorios</h3>
            </div>
            <div className="space-y-2">
              {relatorios.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <span className="text-sm text-muted-foreground">{r.periodo}</span>
                  <div className="flex items-center gap-3">
                    {r.metricas?.score && r.metricas.score > 0 && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.metricas.score >= 80 ? "text-green-400 bg-green-400/10" :
                        r.metricas.score >= 60 ? "text-yellow-400 bg-yellow-400/10" :
                        "text-red-400 bg-red-400/10"
                      }`}>
                        Score {r.metricas.score}
                      </span>
                    )}
                    <Link
                      href={`/onix-corretora/relatorios/${r.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver relatorio
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
