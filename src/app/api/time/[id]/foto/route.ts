import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { downloadContrato } from "@/lib/b2/upload";
import { chaveFotoPessoa, tipoImagem } from "@/lib/time-foto";

/**
 * Serve a foto de perfil de uma pessoa do time.
 *
 * O bucket do B2 é PRIVADO — é onde vivem contratos e backups. A foto entra
 * nele por reuso de infraestrutura, mas isso significa que não existe URL
 * pública: a imagem precisa passar por aqui.
 *
 * Gate: sessão válida. Foto de colega não é dado sensível como CPF (que exige
 * canManage), mas também não é conteúdo público — a mesma régua do resto do
 * /time, que já exige login para qualquer coisa.
 *
 * A chave é derivada do id da rota (lib/time-foto), então não há como pedir um
 * objeto arbitrário do bucket alterando a URL: `/api/time/<qualquer>/foto` só
 * consegue alcançar `time/foto/<qualquer>`, nunca `contratos/...`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "nao_autenticado" }, { status: 401 });
  }

  const { id } = await params;
  // cuid: só letras e dígitos. Barrar aqui evita que "../" ou "/" cheguem a
  // formar uma chave fora do prefixo time/foto/.
  if (!/^[a-z0-9]+$/i.test(id)) {
    return NextResponse.json({ error: "id_invalido" }, { status: 400 });
  }

  try {
    const buffer = await downloadContrato(chaveFotoPessoa(id));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": tipoImagem(buffer),
        // Privado: é foto de pessoa atrás de login, não deve entrar em cache
        // compartilhado. O `?v=` na URL cuida da invalidação no browser.
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    // Sem foto no bucket é caso normal (ficha antiga, upload que falhou):
    // a UI cai para as iniciais.
    return NextResponse.json({ error: "sem_foto" }, { status: 404 });
  }
}
