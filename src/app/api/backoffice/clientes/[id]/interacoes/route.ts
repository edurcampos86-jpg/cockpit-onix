import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { proximoContatoPor } from "@/lib/cadencia";
import { rbacEnforcementHabilitado, assertClienteVisivel } from "@/lib/rbac";
import { getAuthContext } from "@/lib/auth-helpers";
import { getSession } from "@/lib/session";
import { recomputeAgregadosReuniao, upsertReuniao } from "@/lib/reunioes";
import { validarCamposTemporaisInteracao } from "@/lib/interacao-input-core";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // RBAC — Camada 2 (escopo). Flag RBAC_ENFORCEMENT (default OFF) → idêntico a
    // hoje. ON → cliente fora do escopo responde 404 (NÃO lista vazia, que
    // disfarçaria como "cliente sem interações" e ainda vazaria a existência).
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const interacoes = await prisma.interacaoCliente.findMany({
      where: { clienteId: id },
      orderBy: { data: "desc" },
    });
    return NextResponse.json({ interacoes });
  } catch (error) {
    console.error("Erro ao listar interações:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { id } = await params;

    // RBAC — Camada 2 (escopo). Registrar interação fora do escopo = 404 (não
    // pode ver ⇒ não pode editar). Checagem ANTES de tocar o banco. Flag
    // RBAC_ENFORCEMENT (default OFF) → idêntico a hoje.
    if (await rbacEnforcementHabilitado()) {
      const ctx = await getAuthContext();
      const { visivel } = await assertClienteVisivel(id, ctx);
      if (!visivel) {
        return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
      }
    }

    const body = await req.json();
    const tipo = String(body.tipo || "ligacao").trim();
    const resumo = typeof body.resumo === "string" ? body.resumo.trim() : "";
    if ((tipo === "ligacao" || tipo === "reuniao") && !resumo) {
      return NextResponse.json(
        { error: "Relato do que foi tratado é obrigatório para ligação ou reunião" },
        { status: 400 },
      );
    }
    const camposTemporais = validarCamposTemporaisInteracao({
      tipo,
      data: body.data,
      duracaoMin: body.duracaoMin,
    });
    if (!camposTemporais.ok) {
      return NextResponse.json({ error: camposTemporais.erro }, { status: 400 });
    }

    const cliente = await prisma.clienteBackoffice.findUnique({ where: { id } });
    if (!cliente) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

    const resultado = await prisma.$transaction(async (tx) => {
      const criada = await tx.interacaoCliente.create({
        data: {
          clienteId: id,
          tipo,
          canal: body.canal || null,
          assunto: String(body.assunto || "Contato"),
          resumo: resumo || null,
          duracaoMin: camposTemporais.duracaoMin,
          rcaNotas: body.rcaNotas || null,
          data: camposTemporais.data,
        },
      });

      // A reunião rápida também entra na fonte canônica. Sem esta linha, o
      // próximo sync de agenda recomputaria os caches e apagaria o registro.
      let reuniaoAgregada: {
        data: Date | null;
        source: string | null;
        confirmadaManualmente: boolean;
      } | null = null;
      if (tipo === "reuniao") {
        await upsertReuniao(
          {
            clienteId: id,
            userId: null,
            source: "manual",
            externalId: `interacao:${criada.id}`,
            startAt: criada.data,
            titulo: criada.assunto,
            matchedVia: "manual",
            rawPayload: {
              interacaoId: criada.id,
              resumo,
              registradoPor: session.userId,
            },
          },
          tx,
        );
        await recomputeAgregadosReuniao(id, tx);
        const vencedora = await tx.clienteBackoffice.findUniqueOrThrow({
          where: { id },
          select: {
            ultimaReuniaoAt: true,
            ultimaReuniaoSource: true,
            ultimaReuniaoConfirmadaManualmente: true,
          },
        });
        reuniaoAgregada = {
          data: vencedora.ultimaReuniaoAt,
          source: vencedora.ultimaReuniaoSource,
          confirmadaManualmente: vencedora.ultimaReuniaoConfirmadaManualmente,
        };
      }

      // Mantém o comportamento histórico desta rota para cadência e contato.
      // O agregado de reunião acima tem um único dono: ReuniaoCliente.
      await tx.clienteBackoffice.update({
        where: { id },
        data: {
          proximoContatoAt: proximoContatoPor(cliente.classificacao),
        },
      });
      // Uma interação lançada com atraso entra no histórico, mas nunca pode
      // apagar um contato mais recente. O filtro no UPDATE mantém a garantia
      // mesmo se duas requests concorrentes passarem pela leitura acima.
      await tx.clienteBackoffice.updateMany({
        where: {
          id,
          OR: [{ ultimoContatoAt: null }, { ultimoContatoAt: { lt: criada.data } }],
        },
        data: { ultimoContatoAt: criada.data },
      });

      return { interacao: criada, reuniaoAgregada };
    });

    // Mantém todos os campos legados da interação no top-level. Só reuniões
    // ganham o campo aditivo com a linha que realmente venceu o recompute.
    return NextResponse.json(
      resultado.reuniaoAgregada
        ? { ...resultado.interacao, reuniaoAgregada: resultado.reuniaoAgregada }
        : resultado.interacao,
    );
  } catch (error) {
    console.error("Erro ao registrar interação:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
