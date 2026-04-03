/**
 * API Route: GET /api/analytics
 * 
 * Retorna histórico de análises semanais e recomendações.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const includeRecommendations = searchParams.get('recommendations') !== 'false'
    
    const analyses = await prisma.weeklyAnalysis.findMany({
      orderBy: { weekEnd: 'desc' },
      take: limit,
      include: includeRecommendations ? {
        recommendations: {
          orderBy: [
            { prioridade: 'asc' },
            { createdAt: 'desc' },
          ],
        },
      } : undefined,
    })
    
    // Parsear JSON dos campos
    const parsed = analyses.map(a => ({
      ...a,
      metricas: JSON.parse(a.metricas),
      descobertas: JSON.parse(a.descobertas),
      recomendacoes: JSON.parse(a.recomendacoes),
      proximosTemas: a.proximosTemas ? JSON.parse(a.proximosTemas) : [],
    }))
    
    return NextResponse.json({ analyses: parsed })
    
  } catch (error) {
    console.error('Erro ao buscar análises:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar análises', details: String(error) },
      { status: 500 }
    )
  }
}
