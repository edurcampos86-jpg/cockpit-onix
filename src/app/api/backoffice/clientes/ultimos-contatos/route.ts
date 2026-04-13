import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConfig } from "@/lib/config-db";
import {
  fetchConversas,
  fetchMensagens,
  VENDEDORES_CONFIG,
} from "@/lib/datacrazy";
import { listarArquivos, filtrarArquivosPorPeriodo, buscarTranscricao } from "@/lib/plaud";

interface ContatoResumo {
  data: string;
  canal: "whatsapp" | "reuniao" | "ligacao";
  resumo: string;
}

interface ClienteContatos {
  clienteId: string;
  contatos: ContatoResumo[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /api/backoffice/clientes/ultimos-contatos
 *
 * Busca os últimos contatos de clientes via Datacraze (WhatsApp) e Plaud (reuniões).
 * Recebe: { clienteIds?: string[] } — se vazio, busca para todos os clientes com telefone.
 * Retorna: { contatos: Record<clienteId, ContatoResumo[]> }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clienteIds: string[] | undefined = body.clienteIds;

    // Busca clientes com telefone para matching
    const clientes = await prisma.clienteBackoffice.findMany({
      where: clienteIds?.length
        ? { id: { in: clienteIds } }
        : {},
      select: { id: true, nome: true, telefone: true },
    });

    const resultado: Record<string, ContatoResumo[]> = {};

    // ── Datacraze (WhatsApp) ──────────────────────────────────────────────
    const datacrazyToken = await getConfig("DATACRAZY_TOKEN");
    let conversasMap: Map<string, { data: string; nome: string; resumo: string }> = new Map();

    if (datacrazyToken) {
      try {
        // Busca conversas do Eduardo Campos (assessor principal)
        const config = VENDEDORES_CONFIG["Eduardo Campos"];
        if (config) {
          for (const instanceId of config.instanceIds) {
            const conversas = await fetchConversas(instanceId, datacrazyToken, 2);

            for (const conversa of conversas) {
              const contactPhone = conversa.contact?.phone ?? conversa.contact?.number ?? conversa.phone ?? "";
              const contactName = conversa.contact?.name ?? conversa.contactName ?? conversa.name ?? "";
              const lastMsgDate = conversa.lastMessageDate ?? conversa.updatedAt ?? conversa.lastMessage?.createdAt;

              if (!contactPhone && !contactName) continue;

              // Tenta fazer match com clientes pelo telefone ou nome
              for (const cliente of clientes) {
                const telefoneCliente = (cliente.telefone || "").replace(/\D/g, "");
                const nomeCliente = cliente.nome.toLowerCase().trim();
                const nomeContato = contactName.toLowerCase().trim();
                const telefoneContato = contactPhone.replace(/\D/g, "");

                const matchTelefone = telefoneCliente && telefoneContato &&
                  (telefoneContato.includes(telefoneCliente) || telefoneCliente.includes(telefoneContato));
                const matchNome = nomeCliente && nomeContato &&
                  (nomeContato.includes(nomeCliente) || nomeCliente.includes(nomeContato));

                if (matchTelefone || matchNome) {
                  // Busca resumo das últimas mensagens
                  let resumo = "";
                  const conversaId = conversa.id ?? conversa._id;
                  if (conversaId) {
                    try {
                      const msgs = await fetchMensagens(conversaId, datacrazyToken, 1);
                      if (msgs.length > 0) {
                        // Pega as últimas 3 mensagens de texto como resumo
                        const textos = msgs
                          .filter((m: any) => {
                            const body = m.body ?? m.text ?? m.message?.conversation ?? "";
                            return typeof body === "string" && body.trim().length > 0;
                          })
                          .slice(-3)
                          .map((m: any) => {
                            const body = m.body ?? m.text ?? m.message?.conversation ?? "";
                            const received = m.received !== undefined ? m.received : m.fromMe === false;
                            return `${received ? "Cliente" : "Assessor"}: ${body.trim().substring(0, 80)}`;
                          });
                        resumo = textos.join(" | ");
                      }
                      await delay(1000); // Rate limit
                    } catch {
                      resumo = "WhatsApp — detalhes indisponíveis";
                    }
                  }

                  const existing = conversasMap.get(cliente.id);
                  if (!existing || (lastMsgDate && new Date(lastMsgDate) > new Date(existing.data))) {
                    conversasMap.set(cliente.id, {
                      data: lastMsgDate ? new Date(lastMsgDate).toISOString() : "",
                      nome: contactName,
                      resumo: resumo || `Conversa WhatsApp com ${contactName}`,
                    });
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("[Ultimos contatos] Erro Datacraze:", e);
      }
    }

    // ── Plaud (Reuniões gravadas) ─────────────────────────────────────────
    const plaudToken = await getConfig("PLAUD_TOKEN");
    let reunioesMap: Map<string, { data: string; nome: string; resumo: string }> = new Map();

    if (plaudToken) {
      try {
        const todos = await listarArquivos(plaudToken);
        // Filtra últimos 90 dias
        const agora = new Date();
        const inicio = new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000);
        const recentes = filtrarArquivosPorPeriodo(todos, inicio, agora);

        for (const arquivo of recentes) {
          const filenameLC = arquivo.filename.toLowerCase();

          for (const cliente of clientes) {
            const nomePartes = cliente.nome.toLowerCase().split(/\s+/);
            // Match se o primeiro ou último nome aparece no filename
            const match = nomePartes.some((p) => p.length > 2 && filenameLC.includes(p));

            if (match) {
              const existing = reunioesMap.get(cliente.id);
              const dataArquivo = new Date(arquivo.start_time).toISOString();

              if (!existing || new Date(dataArquivo) > new Date(existing.data)) {
                let resumo = `Reunião: ${arquivo.filename}`;
                // Busca resumo da transcrição
                try {
                  const t = await buscarTranscricao(
                    arquivo.id,
                    arquivo.filename,
                    arquivo.start_time,
                    arquivo.duration,
                    plaudToken
                  );
                  if (t?.resumoIA) {
                    resumo = t.resumoIA.substring(0, 150);
                  } else if (t?.textoCompleto) {
                    resumo = t.textoCompleto.substring(0, 150) + "...";
                  }
                  await delay(300);
                } catch {
                  // Mantém resumo padrão
                }

                reunioesMap.set(cliente.id, {
                  data: dataArquivo,
                  nome: arquivo.filename,
                  resumo,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("[Ultimos contatos] Erro Plaud:", e);
      }
    }

    // ── Combinar resultados ───────────────────────────────────────────────
    for (const cliente of clientes) {
      const contatos: ContatoResumo[] = [];

      const whatsapp = conversasMap.get(cliente.id);
      if (whatsapp) {
        contatos.push({
          data: whatsapp.data,
          canal: "whatsapp",
          resumo: whatsapp.resumo,
        });
      }

      const reuniao = reunioesMap.get(cliente.id);
      if (reuniao) {
        contatos.push({
          data: reuniao.data,
          canal: "reuniao",
          resumo: reuniao.resumo,
        });
      }

      // Também busca interações manuais registradas no sistema
      const interacoes = await prisma.interacaoCliente.findMany({
        where: { clienteId: cliente.id },
        orderBy: { data: "desc" },
        take: 2,
        select: { data: true, tipo: true, assunto: true, resumo: true },
      });

      for (const inter of interacoes) {
        contatos.push({
          data: inter.data.toISOString(),
          canal: inter.tipo === "whatsapp" ? "whatsapp" : inter.tipo === "reuniao" ? "reuniao" : "ligacao",
          resumo: inter.resumo || inter.assunto,
        });
      }

      // Ordena por data mais recente e pega os 2 últimos
      contatos.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      resultado[cliente.id] = contatos.slice(0, 2);
    }

    return NextResponse.json({
      contatos: resultado,
      fontes: {
        datacraze: !!datacrazyToken,
        plaud: !!plaudToken,
        interacoes: true,
      },
    });
  } catch (error) {
    console.error("[Ultimos contatos] Erro geral:", error);
    return NextResponse.json(
      { error: "Erro ao buscar últimos contatos", detail: error instanceof Error ? error.message : "Desconhecido" },
      { status: 500 }
    );
  }
}
