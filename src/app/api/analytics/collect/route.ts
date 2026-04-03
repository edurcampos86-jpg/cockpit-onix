/**
 * API Route: POST /api/analytics/collect
 * 
 * Coleta posts do Instagram via MCP, calcula métricas e salva no banco.
 * Pode ser chamado manualmente (sob demanda) ou automaticamente (cron).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'
import { collectWeeklyPosts, getAccountInfo } from '@/lib/integrations/instagram-mcp'
import { analyzeWeek } from '@/lib/analytics/analyzer'

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const body = await request.json().catch(() => ({}))
    const { weekStart: weekStartStr, weekEnd: weekEndStr } = body
    
    // Definir período de análise (padrão: última semana)
    const now = new Date()
    const weekEnd = weekEndStr ? new Date(weekEndStr) : now
    const weekStart = weekStartStr 
      ? new Date(weekStartStr)
      : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    
    // Coletar informações da conta
    const accountInfo = await getAccountInfo()
    
    // Coletar posts da semana com insights
    const posts = await collectWeeklyPosts(weekStart, weekEnd)
    
    // Salvar posts no banco (upsert para não duplicar)
    for (const post of posts) {
      await prisma.instagramPost.upsert({
        where: { instagramId: post.id },
        update: {
          likes: post.likes,
          comments: post.comments,
          shares: post.insights.shares,
          saved: post.insights.saved,
          reach: post.insights.reach,
          views: post.insights.views,
          totalInteractions: post.insights.totalInteractions,
          engagementRate: post.engagementRate,
          saveRate: post.saveRate,
          pilar: post.pilar || undefined,
          formato: post.formato || undefined,
          ctaType: post.ctaType || undefined,
          insightsCollectedAt: new Date(),
        },
        create: {
          instagramId: post.id,
          type: post.type,
          caption: post.caption,
          permalink: post.permalink,
          pilar: post.pilar || undefined,
          formato: post.formato || undefined,
          ctaType: post.ctaType || undefined,
          likes: post.likes,
          comments: post.comments,
          shares: post.insights.shares,
          saved: post.insights.saved,
          reach: post.insights.reach,
          views: post.insights.views,
          totalInteractions: post.insights.totalInteractions,
          engagementRate: post.engagementRate,
          saveRate: post.saveRate,
          publishedAt: new Date(post.publishedAt),
          insightsCollectedAt: new Date(),
        },
      })
    }
    
    // Executar análise
    const analysis = analyzeWeek(posts)
    
    // Calcular variação de seguidores (buscar análise anterior)
    const previousAnalysis = await prisma.weeklyAnalysis.findFirst({
      orderBy: { weekEnd: 'desc' },
      where: { weekEnd: { lt: weekStart } },
    })
    
    const previousFollowers = previousAnalysis 
      ? JSON.parse(previousAnalysis.metricas).totalFollowers || accountInfo.followers
      : accountInfo.followers
    
    const followerDiff = accountInfo.followers - previousFollowers
    
    // Salvar análise semanal
    const weeklyAnalysis = await prisma.weeklyAnalysis.create({
      data: {
        weekStart,
        weekEnd,
        totalPosts: posts.length,
        newFollowers: Math.max(0, followerDiff),
        lostFollowers: Math.max(0, -followerDiff),
        totalFollowers: accountInfo.followers,
        metricas: JSON.stringify({
          totalFollowers: accountInfo.followers,
          totalFollowing: accountInfo.following,
          porPilar: analysis.metricasPorPilar,
          porFormato: analysis.metricasPorFormato,
          snapshot: analysis.snapshot,
        }),
        descobertas: JSON.stringify(analysis.descobertas),
        recomendacoes: JSON.stringify(analysis.recomendacoes),
        proximosTemas: JSON.stringify(analysis.proximosTemas),
        geradoPor: body.geradoPor || 'manual',
      },
    })
    
    // Salvar recomendações no banco
    for (const rec of analysis.recomendacoes) {
      await prisma.recommendation.create({
        data: {
          tipo: rec.tipo,
          titulo: rec.titulo,
          descricao: rec.descricao,
          acao: rec.acao,
          impactoEsperado: rec.impactoEsperado,
          prioridade: rec.prioridade,
          status: 'pendente',
          weeklyAnalysisId: weeklyAnalysis.id,
        },
      })
    }
    
    return NextResponse.json({
      success: true,
      analysisId: weeklyAnalysis.id,
      summary: {
        postsColetados: posts.length,
        descobertas: analysis.descobertas.length,
        recomendacoes: analysis.recomendacoes.length,
        seguidores: accountInfo.followers,
        variacaoSeguidores: followerDiff,
      },
      analysis,
    })
    
  } catch (error) {
    console.error('Erro ao coletar dados do Instagram:', error)
    return NextResponse.json(
      { error: 'Erro ao coletar dados do Instagram', details: String(error) },
      { status: 500 }
    )
  }
}
