import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Anexos da sugestão: até 5 arquivos de 10 MB cada (ver
      // src/lib/implementacoes/anexos.ts → MAX_ANEXOS × MAX_ANEXO_BYTES).
      // O default do Next é 1 MB — sem isto, qualquer anexo acima de ~1 MB
      // falha ANTES da action rodar, com a mesma mensagem genérica.
      bodySizeLimit: "55mb",
    },

    // O teto que REALMENTE corta primeiro. Só existe porque existe `src/proxy.ts`:
    // com proxy no caminho, o Next clona o corpo da requisição com um limite
    // próprio, default 10 MiB (`next/dist/server/body-streams.js` →
    // DEFAULT_BODY_CLONE_SIZE_LIMIT). Estourado o limite, o corpo chega
    // TRUNCADO e o leitor de multipart morre com "Unexpected end of form" —
    // como `uncaughtException`, FORA da action. Nenhum try/catch da aplicação
    // alcança, e o usuário leva 500 sem texto em vez da mensagem tratada.
    //
    // Foi o que derrubou o upload de PAT em produção (29/08/2026, digest
    // 3916280396): a guarda do app estava em 20 MB, o `bodySizeLimit` em 55 MB,
    // e nenhum dos dois chegava a rodar porque o corte acontecia em 10 MiB.
    //
    // ⚠️ O NOME É ARMADILHA. A mensagem de erro do Next cita
    // `middlewareClientMaxBodySize` — que existe no schema e NÃO é lida pelo
    // runtime. Quem o runtime lê é esta:
    //   node_modules/next/dist/server/next-server.js:1274
    //   nextConfig.experimental.proxyClientMaxBodySize
    // Reconferir essa linha a cada bump de versão do Next.
    //
    // A REGRA que este número serve: o proxy tem de ficar ACIMA de toda guarda
    // de aplicação, para que quem recuse seja sempre quem sabe explicar.
    //
    // 30 MB, e não 25: a maior guarda do app é a do cockpit-reunião, em 25 MB.
    // Empatar com ela deixaria um arquivo de exatamente 25 MB reencenar ali o
    // mesmo 500 mudo do PAT — empate não satisfaz "ACIMA de toda guarda".
    // Ao subir qualquer guarda de fluxo, conferir este número primeiro.
    //
    // Inventário das cinco camadas e das guardas de cada fluxo:
    //   docs/onix-limites-de-upload.md
    proxyClientMaxBodySize: "30mb",
  },
  // Fase 4 (piloto) — namespacing de rotas por empresa.
  // /backoffice/* → /empresas/investimentos/* (Onix Investimentos).
  // permanent:false (307) DE PROPÓSITO durante o rollout: redirect temporário,
  // pra não cravar 308/301 cacheado no browser antes de validar em prod.
  // Promover a permanent:true (308) é um PR seguinte, só após confirmar.
  async redirects() {
    return [
      {
        source: "/backoffice",
        destination: "/empresas/investimentos",
        permanent: false,
      },
      {
        // :path* preserva o restante, incluindo a rota dinâmica clientes/:id
        source: "/backoffice/:path*",
        destination: "/empresas/investimentos/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
