/**
 * API Route: POST /api/analytics/apply-adjustment
 * 
 * Aplica um ajuste de roteiro baseado em uma recomendação aceita.
 * Atualiza o template do roteiro e registra o histórico de ajuste.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    
    const body = await request.json()
    const { recommendationId, scriptId, ajuste, campo, novoValor } = body
    
    if (!recommendationId || !ajuste) {
      return NextResponse.json(
        { error: 'recommendationId e ajuste são obrigatórios' },
        { status: 400 }
      )
    }
    
    // Buscar recomendação
    const recommendation = await prisma.recommendation.findUnique({
      where: { id: recommendationId },
    })
    
    if (!recommendation) {
      return NextResponse.json({ error: 'Recomendação não encontrada' }, { status: 404 })
    }
    
    let scriptAntes: string | undefined
    let scriptDepois: string | undefined
    
    // Se um scriptId foi fornecido, aplicar o ajuste no roteiro
    if (scriptId && campo && novoValor) {
      const script = await prisma.script.findUnique({
        where: { id: scriptId },
      })
      
      if (script) {
        // Salvar versão anterior
        await prisma.scriptVersion.create({
          data: {
            scriptId,
            title: script.title,
            hook: script.hook,
            body: script.body,
            cta: script.cta,
            ctaType: script.ctaType,
            estimatedTime: script.estimatedTime,
            hashtags: script.hashtags,
            changeReason: `Ajuste baseado em recomendação: ${recommendation.titulo}`,
          },
        })
        
        // Aplicar ajuste
        const updateData: Record<string, string> = {}
        updateData[campo] = novoValor
        
        scriptAntes = JSON.stringify({ [campo]: (script as Record<string, unknown>)[campo] })
        scriptDepois = JSON.stringify({ [campo]: novoValor })
        
        await prisma.script.update({
          where: { id: scriptId },
          data: updateData,
        })
      }
    }
    
    // Registrar ajuste
    const scriptAdjustment = await prisma.scriptAdjustment.create({
      data: {
        scriptId: scriptId || undefined,
        ajuste,
        motivacao: recommendation.descricao,
        statusAntes: scriptAntes,
        statusDepois: scriptDepois,
        aplicado: true,
        recommendationId,
      },
    })
    
    // Marcar recomendação como implementada
    await prisma.recommendation.update({
      where: { id: recommendationId },
      data: { status: 'implementada' },
    })
    
    return NextResponse.json({
      success: true,
      scriptAdjustment,
      message: 'Ajuste aplicado com sucesso! O roteiro foi atualizado e o histórico foi registrado.',
    })
    
  } catch (error) {
    console.error('Erro ao aplicar ajuste:', error)
    return NextResponse.json(
      { error: 'Erro ao aplicar ajuste', details: String(error) },
      { status: 500 }
    )
  }
}
