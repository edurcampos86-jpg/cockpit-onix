/**
 * API Route: GET /api/analytics/cron
 * 
 * Endpoint para o cron job automático semanal.
 * Deve ser chamado todo domingo às 22:00 via cron externo.
 * 
 * Segurança: protegido por CRON_SECRET para evitar chamadas não autorizadas.
 */

import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Verificar secret do cron
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    // Calcular período da semana anterior (segunda a domingo)
    const now = new Date()
    const dayOfWeek = now.getDay() // 0 = domingo
    const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    
    const weekEnd = new Date(now)
    weekEnd.setDate(now.getDate() - 1) // ontem (sábado)
    weekEnd.setHours(23, 59, 59, 999)
    
    const weekStart = new Date(weekEnd)
    weekStart.setDate(weekEnd.getDate() - 6) // 7 dias atrás
    weekStart.setHours(0, 0, 0, 0)
    
    // Chamar o endpoint de coleta
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
    const collectRes = await fetch(`${baseUrl}/api/analytics/collect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Usar um token interno para autenticação
        'x-internal-cron': process.env.CRON_SECRET || 'internal',
      },
      body: JSON.stringify({
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        geradoPor: 'automatico',
      }),
    })
    
    if (!collectRes.ok) {
      const err = await collectRes.json()
      throw new Error(err.error || 'Erro na coleta automática')
    }
    
    const result = await collectRes.json()
    
    console.log(`[CRON] Análise automática gerada com sucesso:`, {
      analysisId: result.analysisId,
      postsColetados: result.summary?.postsColetados,
      recomendacoes: result.summary?.recomendacoes,
      timestamp: new Date().toISOString(),
    })
    
    return NextResponse.json({
      success: true,
      message: 'Análise automática gerada com sucesso',
      analysisId: result.analysisId,
      summary: result.summary,
    })
    
  } catch (error) {
    console.error('[CRON] Erro na análise automática:', error)
    return NextResponse.json(
      { error: 'Erro na análise automática', details: String(error) },
      { status: 500 }
    )
  }
}
