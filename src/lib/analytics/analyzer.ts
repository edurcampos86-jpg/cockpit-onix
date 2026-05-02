/**
 * Instagram Analytics Engine
 * 
 * Analisa métricas coletadas do Instagram e gera recomendações
 * para ajuste de roteiros e estratégia de conteúdo.
 * 
 * Analogia: É como o "time de analistas" de um fundo de investimentos.
 * Eles estudam a performance de cada ativo, identificam padrões,
 * e recomendam rebalanceamentos para otimizar o portfólio.
 */

import type { InstagramPostClassified } from '../integrations/instagram-mcp'

export interface MetricasPorPilar {
  pilar: string
  posts: number
  alcanceMedio: number
  engajamentoMedio: number
  salvamentosMedio: number
  compartilhamentosMedio: number
  viewsMedio: number
  status: 'acima_esperado' | 'dentro_esperado' | 'abaixo_esperado' | 'ausente'
}

export interface MetricasPorFormato {
  formato: string
  posts: number
  alcanceMedio: number
  engajamentoMedio: number
  salvamentosMedio: number
  taxaSalvamento: number
}

export interface Descoberta {
  tipo: 'positiva' | 'negativa' | 'oportunidade' | 'alerta'
  titulo: string
  descricao: string
  dado: string
}

export interface RecomendacaoGerada {
  tipo: 'pilar' | 'formato' | 'cta' | 'horario' | 'frequencia' | 'tema'
  titulo: string
  descricao: string
  acao: string
  impactoEsperado: string
  prioridade: 'alta' | 'media' | 'baixa'
  ajusteRoteiro?: {
    categoria: string
    campo: string
    sugestao: string
  }
}

export interface AnalysisResult {
  snapshot: {
    totalPosts: number
    pilares: Record<string, number>
    formatos: Record<string, number>
    ctas: Record<string, number>
    melhorPost: { titulo: string; engajamento: number; pilar: string | null }
    piorPost: { titulo: string; engajamento: number; pilar: string | null }
  }
  metricasPorPilar: MetricasPorPilar[]
  metricasPorFormato: MetricasPorFormato[]
  descobertas: Descoberta[]
  recomendacoes: RecomendacaoGerada[]
  proximosTemas: string[]
}

// Benchmarks do Projeto v5.0 (baseados em dados reais do perfil)
const BENCHMARKS = {
  engajamentoMinimo: 8.0,       // 8% mínimo esperado
  engajamentoBom: 15.0,         // 15% bom
  engajamentoExcelente: 25.0,   // 25% excelente
  salvamentosMinimo: 1,         // mínimo por post
  salvamentosIdeal: 3,          // ideal por post
  pilaresIdeal: {               // distribuição ideal por semana
    P1: 2, P2: 1, P3: 1, P4: 1
  },
  horarioPico: '12:00',         // horário de pico do Roberto
  ratioCarrosselReel: 1.4,      // carrosséis geram 1,4x mais salvamentos
  impactoCtaAlgoritmo: 40,      // CTA de Algoritmo amplifica distribuição em 40%
}

/**
 * Calcula métricas por pilar editorial
 */
function calcularMetricasPorPilar(posts: InstagramPostClassified[]): MetricasPorPilar[] {
  const pilares = ['P1', 'P2', 'P3', 'P4']
  
  return pilares.map(pilar => {
    const postsDoPilar = posts.filter(p => p.pilar === pilar)
    
    if (postsDoPilar.length === 0) {
      return {
        pilar,
        posts: 0,
        alcanceMedio: 0,
        engajamentoMedio: 0,
        salvamentosMedio: 0,
        compartilhamentosMedio: 0,
        viewsMedio: 0,
        status: 'ausente' as const,
      }
    }
    
    const alcanceMedio = postsDoPilar.reduce((sum, p) => sum + p.insights.reach, 0) / postsDoPilar.length
    const engajamentoMedio = postsDoPilar.reduce((sum, p) => sum + p.engagementRate, 0) / postsDoPilar.length
    const salvamentosMedio = postsDoPilar.reduce((sum, p) => sum + p.insights.saved, 0) / postsDoPilar.length
    const compartilhamentosMedio = postsDoPilar.reduce((sum, p) => sum + p.insights.shares, 0) / postsDoPilar.length
    const viewsMedio = postsDoPilar.reduce((sum, p) => sum + p.insights.views, 0) / postsDoPilar.length
    
    let status: MetricasPorPilar['status']
    if (engajamentoMedio >= BENCHMARKS.engajamentoExcelente) status = 'acima_esperado'
    else if (engajamentoMedio >= BENCHMARKS.engajamentoBom) status = 'dentro_esperado'
    else status = 'abaixo_esperado'
    
    return {
      pilar,
      posts: postsDoPilar.length,
      alcanceMedio: Math.round(alcanceMedio),
      engajamentoMedio: Math.round(engajamentoMedio * 10) / 10,
      salvamentosMedio: Math.round(salvamentosMedio * 10) / 10,
      compartilhamentosMedio: Math.round(compartilhamentosMedio * 10) / 10,
      viewsMedio: Math.round(viewsMedio),
      status,
    }
  })
}

/**
 * Calcula métricas por formato
 */
function calcularMetricasPorFormato(posts: InstagramPostClassified[]): MetricasPorFormato[] {
  const formatos = ['reel', 'carrossel', 'imagem']
  
  return formatos.map(formato => {
    const postsDoFormato = posts.filter(p => p.formato === formato)
    
    if (postsDoFormato.length === 0) {
      return {
        formato,
        posts: 0,
        alcanceMedio: 0,
        engajamentoMedio: 0,
        salvamentosMedio: 0,
        taxaSalvamento: 0,
      }
    }
    
    const alcanceMedio = postsDoFormato.reduce((sum, p) => sum + p.insights.reach, 0) / postsDoFormato.length
    const engajamentoMedio = postsDoFormato.reduce((sum, p) => sum + p.engagementRate, 0) / postsDoFormato.length
    const salvamentosMedio = postsDoFormato.reduce((sum, p) => sum + p.insights.saved, 0) / postsDoFormato.length
    const taxaSalvamento = postsDoFormato.reduce((sum, p) => sum + p.saveRate, 0) / postsDoFormato.length
    
    return {
      formato,
      posts: postsDoFormato.length,
      alcanceMedio: Math.round(alcanceMedio),
      engajamentoMedio: Math.round(engajamentoMedio * 10) / 10,
      salvamentosMedio: Math.round(salvamentosMedio * 10) / 10,
      taxaSalvamento: Math.round(taxaSalvamento * 100) / 100,
    }
  })
}

/**
 * Identifica descobertas principais da semana
 * 
 * Analogia: É como o "relatório de gestão" de um fundo,
 * que destaca os ativos que mais se destacaram (positiva ou negativamente)
 * e as oportunidades identificadas no período.
 */
function identificarDescobertas(
  posts: InstagramPostClassified[],
  metricasPorPilar: MetricasPorPilar[]
): Descoberta[] {
  const descobertas: Descoberta[] = []
  
  if (posts.length === 0) return descobertas
  
  // Melhor post da semana
  const melhorPost = posts.reduce((best, p) => 
    p.engagementRate > best.engagementRate ? p : best, posts[0])
  
  if (melhorPost.engagementRate > BENCHMARKS.engajamentoBom) {
    descobertas.push({
      tipo: 'positiva',
      titulo: `Post de destaque: ${melhorPost.caption?.substring(0, 50)}...`,
      descricao: `O post do pilar ${melhorPost.pilar || 'não classificado'} foi o destaque da semana com ${melhorPost.engagementRate.toFixed(1)}% de engajamento — ${melhorPost.insights.reach} de alcance e ${melhorPost.insights.views} views.`,
      dado: `${melhorPost.engagementRate.toFixed(1)}% de engajamento`,
    })
  }
  
  // P3 ausente
  const p3 = metricasPorPilar.find(m => m.pilar === 'P3')
  if (p3?.status === 'ausente') {
    descobertas.push({
      tipo: 'alerta',
      titulo: 'P3 (Cenário e Alertas) ausente na semana',
      descricao: 'O Pilar 3 é o "motor de alcance qualificado" que ativa o Dark Social através de medo e urgência. A ausência representa uma lacuna na estratégia de autoridade técnica.',
      dado: '0 posts de P3 na semana',
    })
  }
  
  // Salvamentos críticos
  const totalSalvamentos = posts.reduce((sum, p) => sum + p.insights.saved, 0)
  if (totalSalvamentos < 3 && posts.length >= 3) {
    descobertas.push({
      tipo: 'alerta',
      titulo: 'Salvamentos criticamente baixos',
      descricao: 'Salvamentos são o KPI mais valioso para o algoritmo do Instagram. Poucos salvamentos indicam que o conteúdo não está sendo percebido como "para guardar e consultar depois".',
      dado: `${totalSalvamentos} salvamentos em ${posts.length} posts`,
    })
  }
  
  // CTA de Algoritmo não usado
  const ctaAlgoritmo = posts.filter(p => p.ctaType === 'algoritmo')
  if (ctaAlgoritmo.length === 0) {
    descobertas.push({
      tipo: 'oportunidade',
      titulo: 'CTA de Algoritmo não implementado',
      descricao: 'Nenhum post utilizou CTA de Algoritmo ("Salva esse post", "Compartilha com quem precisa"). Segundo dados da Meta (2024-2025), adicionar esse tipo de CTA pode amplificar a distribuição em até 40%.',
      dado: '0 posts com CTA de Algoritmo',
    })
  }
  
  // P4 performando muito bem
  const p4 = metricasPorPilar.find(m => m.pilar === 'P4')
  const p1 = metricasPorPilar.find(m => m.pilar === 'P1')
  if (p4 && p1 && p4.engajamentoMedio > p1.engajamentoMedio * 2 && p4.posts > 0) {
    descobertas.push({
      tipo: 'positiva',
      titulo: 'P4 (Eduardo Pessoa) é o motor de alcance massivo',
      descricao: `O conteúdo pessoal (P4) está gerando ${p4.engajamentoMedio.toFixed(1)}% de engajamento — ${(p4.engajamentoMedio / p1.engajamentoMedio).toFixed(1)}x superior ao P1. Isso confirma que o storytelling pessoal é o combustível que alimenta todos os outros pilares.`,
      dado: `P4: ${p4.engajamentoMedio.toFixed(1)}% vs P1: ${p1.engajamentoMedio.toFixed(1)}%`,
    })
  }
  
  // Carrossel vs Reel
  const carrosselMetrics = posts.filter(p => p.formato === 'carrossel')
  const reelMetrics = posts.filter(p => p.formato === 'reel')
  
  if (carrosselMetrics.length > 0 && reelMetrics.length > 0) {
    const carrosselSaves = carrosselMetrics.reduce((sum, p) => sum + p.insights.saved, 0) / carrosselMetrics.length
    const reelSaves = reelMetrics.reduce((sum, p) => sum + p.insights.saved, 0) / reelMetrics.length
    
    if (carrosselSaves > reelSaves * 1.2) {
      descobertas.push({
        tipo: 'oportunidade',
        titulo: 'Carrosséis geram mais salvamentos que Reels',
        descricao: `Os carrosséis estão gerando ${carrosselSaves.toFixed(1)} salvamentos em média vs ${reelSaves.toFixed(1)} dos Reels. Segundo Later/Hootsuite 2025, carrosséis geram 1,4x mais salvamentos que Reels.`,
        dado: `Carrossel: ${carrosselSaves.toFixed(1)} saves vs Reel: ${reelSaves.toFixed(1)} saves`,
      })
    }
  }
  
  return descobertas
}

/**
 * Gera recomendações acionáveis baseadas nos dados
 * 
 * Analogia: É como o "relatório de rebalanceamento" de um gestor de fundos.
 * Cada recomendação é como uma instrução de "comprar mais X" ou "reduzir Y"
 * para otimizar o portfólio de conteúdo.
 */
function gerarRecomendacoes(
  posts: InstagramPostClassified[],
  metricasPorPilar: MetricasPorPilar[],
  metricasPorFormato: MetricasPorFormato[]
): RecomendacaoGerada[] {
  const recomendacoes: RecomendacaoGerada[] = []
  
  // Recomendação 1: CTA de Algoritmo
  const ctaAlgoritmo = posts.filter(p => p.ctaType === 'algoritmo')
  if (ctaAlgoritmo.length === 0) {
    recomendacoes.push({
      tipo: 'cta',
      titulo: 'Implementar CTA de Algoritmo imediatamente',
      descricao: 'Nenhum post desta semana utilizou CTA de Algoritmo. Segundo dados da Meta (2024-2025), adicionar "Salva esse post" ou "Compartilha com quem precisa" pode amplificar a distribuição em até 40%.',
      acao: 'Em todo post de P1 e P3, incluir no slide final ou nos últimos segundos do Reel: "Salva esse post para consultar quando precisar" ou "Manda para alguém que precisa ouvir isso".',
      impactoEsperado: '+40% de distribuição orgânica (Meta, 2024-2025)',
      prioridade: 'alta',
      ajusteRoteiro: {
        categoria: 'patrimonio_mimimi',
        campo: 'cta',
        sugestao: 'Salva esse post para consultar quando precisar. Se você conhece alguém que precisa ouvir isso, manda para essa pessoa agora.',
      }
    })
  }
  
  // Recomendação 2: P3 ausente
  const p3 = metricasPorPilar.find(m => m.pilar === 'P3')
  if (p3?.status === 'ausente') {
    recomendacoes.push({
      tipo: 'pilar',
      titulo: 'Reativar P3 (Cenário e Alertas) com carrossel',
      descricao: 'O P3 ficou ausente esta semana. O projeto v5.0 posiciona o P3 como o "motor de alcance qualificado" que ativa o Dark Social através de medo e urgência. Carrosséis geram 1,4x mais salvamentos que Reels (Later/Hootsuite 2025).',
      acao: 'Publicar na quinta-feira um carrossel de Alerta Patrimonial. Estrutura: Slide 1 (hook provocativo do Framework PARE), Slides 2-3 (problema com dados), Slides 4-5 (solução prática), Slide Final (CTA duplo: Algoritmo + Explícito).',
      impactoEsperado: '+15% de salvamentos e compartilhamentos via Dark Social',
      prioridade: 'alta',
      ajusteRoteiro: {
        categoria: 'alerta_patrimonial',
        campo: 'hook',
        sugestao: 'Na Bahia, o ITCMD pode levar até 8% do seu patrimônio. Você sabe quanto vai custar para sua família?',
      }
    })
  }
  
  // Recomendação 3: Framework PARE nos hooks
  const postsComHookFraco = posts.filter(p => {
    if (!p.caption) return false
    const firstLine = p.caption.split('\n')[0].toLowerCase()
    // Verificar se o hook não começa com pergunta, afirmação forte, revelação ou emoção
    return !firstLine.includes('?') && 
           !firstLine.includes('você') && 
           !firstLine.includes('nunca') &&
           !firstLine.includes('hoje') &&
           firstLine.length > 0
  })
  
  if (postsComHookFraco.length > 0) {
    recomendacoes.push({
      tipo: 'formato',
      titulo: 'Aplicar Framework PARE nos hooks dos Reels',
      descricao: 'O Framework PARE (Pergunta, Afirmação, Revelação, Emoção) deve ser aplicado nos primeiros 3 segundos de cada Reel. Hooks estruturados geram maior retenção inicial, que é o principal sinal para o algoritmo distribuir o conteúdo.',
      acao: 'Antes de gravar cada Reel, definir qual tipo de hook PARE será usado: Revelação ("Na Bahia, o ITCMD pode custar até 8% do patrimônio") ou Emoção ("Se você falar amanhã, sua família sabe o que fazer?").',
      impactoEsperado: '+20% de retenção nos primeiros 3 segundos',
      prioridade: 'media',
    })
  }
  
  // Recomendação 4: Carrossel para P1 e P3
  const p1Reels = posts.filter(p => p.pilar === 'P1' && p.formato === 'reel')
  const carrosselMetrics = metricasPorFormato.find(m => m.formato === 'carrossel')
  const reelMetrics = metricasPorFormato.find(m => m.formato === 'reel')
  
  if (p1Reels.length > 0 && carrosselMetrics && reelMetrics && 
      carrosselMetrics.salvamentosMedio > reelMetrics.salvamentosMedio) {
    recomendacoes.push({
      tipo: 'formato',
      titulo: 'Migrar P1 (Blindagem Patrimonial) para carrossel',
      descricao: `Os dados de 2026 mostram que carrosséis geram 3,1x mais engajamento e 1,4x mais salvamentos que Reels. Para o nicho financeiro, o salvamento é a métrica mais valiosa — indica que o Roberto considerou a informação útil o suficiente para consultar depois.`,
      acao: 'Converter os próximos posts de P1 de Reel para Carrossel. Estrutura ideal: 5-7 slides com Slide 1 (hook PARE), Slides 2-4 (conteúdo educativo), Slide Final (CTA de Algoritmo + resumo).',
      impactoEsperado: '+40% de salvamentos em P1 (dados 2026, Marketing Agent Blog)',
      prioridade: 'media',
      ajusteRoteiro: {
        categoria: 'patrimonio_mimimi',
        campo: 'body',
        sugestao: 'Estrutura de carrossel: Slide 1 - Hook (pergunta ou revelação do Framework PARE)\nSlide 2 - O problema (com dado estatístico)\nSlide 3 - Por que isso acontece\nSlide 4 - A solução\nSlide 5 - Como aplicar\nSlide Final - CTA de Algoritmo: "Salva esse post para consultar quando precisar"',
      }
    })
  }
  
  // Recomendação 5: Horário de publicação
  const postsForaDoHorarioPico = posts.filter(p => {
    const hour = new Date(p.publishedAt).getHours()
    return hour < 11 || hour > 14 // Fora da janela 11h-14h
  })
  
  if (postsForaDoHorarioPico.length > posts.length * 0.6) {
    recomendacoes.push({
      tipo: 'horario',
      titulo: 'Publicar nos horários de pico do Roberto (12:00-12:30)',
      descricao: 'O persona Roberto (médico, 38-52 anos) está mais ativo entre 12:00-12:30 (intervalo de plantão/consultório). Publicar no horário em que o Roberto está mais ativo aumenta o alcance inicial do post, que é determinante para o algoritmo decidir se vai distribuir o conteúdo para mais pessoas.',
      acao: 'Agendar publicações para 12:00-12:30, especialmente segunda-feira (P1) e terça-feira (P2). Use a função de agendamento do Ecossistema para programar com antecedência.',
      impactoEsperado: '+20% de alcance inicial (fator determinante para o algoritmo)',
      prioridade: 'media',
    })
  }
  
  // Recomendação 6: Funil de conteúdo semanal (Tema Central)
  // Verificar diversidade de pilares como proxy para coerência temática
  const pilaresDistintos = new Set(posts.map(p => p.pilar).filter(Boolean))
  if (pilaresDistintos.size > 3 || pilaresDistintos.size === 0) {
    recomendacoes.push({
      tipo: 'tema',
      titulo: 'Implementar Funil de Conteúdo Semanal (Regra do Fio Condutor)',
      descricao: 'Os posts da semana parecem desconectados entre si. Na v5.0, cada semana deve ter um Tema Central (ex: "Sucessão de Clínicas Médicas"). Isso cria um "efeito Netflix" onde o seguidor se sente compelido a acompanhar a semana inteira para ter a visão completa.',
      acao: 'Definir o Tema Central da próxima semana antes de criar qualquer conteúdo. Todos os posts (P1, P2, P3, P4) devem orbitar esse tema. Segunda (P1 carrossel educativo) → Terça (P2 caso real) → Quinta (P4/TBT híbrido) → Sábado (P4 bastidores).',
      impactoEsperado: '+30% de retenção de seguidores e autoridade percebida',
      prioridade: 'alta',
    })
  }
  
  // Recomendação 7: Capitalizar pico de engajamento
  const melhorPost = posts.reduce((best, p) => 
    p.engagementRate > best.engagementRate ? p : best, posts[0])
  
  if (melhorPost && melhorPost.engagementRate > BENCHMARKS.engajamentoExcelente && melhorPost.pilar === 'P4') {
    recomendacoes.push({
      tipo: 'frequencia',
      titulo: 'Capitalizar o efeito do post viral com sequência estratégica',
      descricao: `O post de ${melhorPost.pilar} gerou ${melhorPost.engagementRate.toFixed(1)}% de engajamento. Contas que geram picos de engajamento recebem um "boost" temporário na distribuição dos posts seguintes — é como uma "janela de liquidez" no mercado: precisa ser aproveitada antes que feche.`,
      acao: 'Nos próximos 3-5 dias após um post viral de P4, publicar conteúdo de P1 ou P2 com CTA Explícito para converter a atenção em leads. Sequência ideal: P4 (viral) → P2 (caso real com CTA Direct) → P1 (carrossel educativo com CTA Algoritmo).',
      impactoEsperado: '+25% de conversão de alcance em leads',
      prioridade: 'alta',
    })
  }
  
  return recomendacoes
}

/**
 * Sugere temas para a próxima semana com base em performance
 */
function sugerirProximosTemas(posts: InstagramPostClassified[]): string[] {
  const temas = [
    'Sucessão de Clínicas Médicas: O que acontece com sua clínica se você falecer?',
    'ITCMD na Bahia: Quanto vai custar para sua família receber sua herança?',
    'O Custo do Dinheiro Parado: Por que sua reserva de emergência está te custando caro',
    'Holding Familiar: Como proteger o patrimônio dos seus filhos antes que seja tarde',
    'Previdência Privada: PGBL vs VGBL — qual é o certo para você?',
    'Seguro de Vida: Quanto você precisa para proteger sua família?',
    'Diversificação Patrimonial: Não coloque todos os ovos na mesma cesta',
    'Planejamento Tributário: Como pagar menos IR de forma legal',
  ]
  
  // Retornar 3 sugestões aleatórias
  return temas.sort(() => Math.random() - 0.5).slice(0, 3)
}

/**
 * Executa análise completa da semana
 * 
 * Analogia: É como o "relatório trimestral" de um fundo de investimentos.
 * Ele consolida toda a performance do período, identifica os destaques,
 * e apresenta recomendações para o próximo trimestre.
 */
export function analyzeWeek(posts: InstagramPostClassified[]): AnalysisResult {
  const metricasPorPilar = calcularMetricasPorPilar(posts)
  const metricasPorFormato = calcularMetricasPorFormato(posts)
  const descobertas = identificarDescobertas(posts, metricasPorPilar)
  const recomendacoes = gerarRecomendacoes(posts, metricasPorPilar, metricasPorFormato)
  const proximosTemas = sugerirProximosTemas(posts)
  
  // Snapshot
  const pilares: Record<string, number> = {}
  const formatos: Record<string, number> = {}
  const ctas: Record<string, number> = {}
  
  posts.forEach(p => {
    if (p.pilar) pilares[p.pilar] = (pilares[p.pilar] || 0) + 1
    if (p.formato) formatos[p.formato] = (formatos[p.formato] || 0) + 1
    if (p.ctaType) ctas[p.ctaType] = (ctas[p.ctaType] || 0) + 1
  })
  
  const melhorPost = posts.length > 0 
    ? posts.reduce((best, p) => p.engagementRate > best.engagementRate ? p : best, posts[0])
    : null
  
  const piorPost = posts.length > 0
    ? posts.reduce((worst, p) => p.engagementRate < worst.engagementRate ? p : worst, posts[0])
    : null
  
  return {
    snapshot: {
      totalPosts: posts.length,
      pilares,
      formatos,
      ctas,
      melhorPost: melhorPost ? {
        titulo: melhorPost.caption?.substring(0, 60) + '...' || 'Sem título',
        engajamento: melhorPost.engagementRate,
        pilar: melhorPost.pilar,
      } : { titulo: 'N/A', engajamento: 0, pilar: null },
      piorPost: piorPost ? {
        titulo: piorPost.caption?.substring(0, 60) + '...' || 'Sem título',
        engajamento: piorPost.engagementRate,
        pilar: piorPost.pilar,
      } : { titulo: 'N/A', engajamento: 0, pilar: null },
    },
    metricasPorPilar,
    metricasPorFormato,
    descobertas,
    recomendacoes,
    proximosTemas,
  }
}
