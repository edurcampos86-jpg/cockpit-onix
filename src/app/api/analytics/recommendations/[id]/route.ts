/**
 * API Route: PATCH /api/analytics/recommendations/[id]
 * 
 * Atualiza o status de uma recomendação (pendente → implementada | descartada).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const { id } = await params
    const body = await request.json()
    const { status } = body
    
    if (!['pendente', 'implementada', 'descartada'].includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido. Use: pendente, implementada ou descartada' },
        { status: 400 }
      )
    }
    
    const recommendation = await prisma.recommendation.update({
      where: { id },
      data: { status },
    })
    
    return NextResponse.json({ recommendation })
    
  } catch (error) {
    console.error('Erro ao atualizar recomendação:', error)
    return NextResponse.json(
      { error: 'Erro ao atualizar recomendação', details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const { id } = await params
    
    const recommendation = await prisma.recommendation.findUnique({
      where: { id },
      include: {
        scriptAdjustments: true,
        weeklyAnalysis: true,
      },
    })
    
    if (!recommendation) {
      return NextResponse.json({ error: 'Recomendação não encontrada' }, { status: 404 })
    }
    
    return NextResponse.json({ recommendation })
    
  } catch (error) {
    console.error('Erro ao buscar recomendação:', error)
    return NextResponse.json(
      { error: 'Erro ao buscar recomendação', details: String(error) },
      { status: 500 }
    )
  }
}
