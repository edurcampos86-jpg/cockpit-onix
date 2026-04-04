const DATACRAZY_BASE_URL = "https://api.g1.datacrazy.io/api/v1";

export const VENDEDORES_CONFIG: Record<
  string,
  {
    instanceIds: string[];
    attendantId: string;
    excludeContacts: string[];
  }
> = {
  "Eduardo Campos": {
    instanceIds: ["68f29107553523cea7840fdf"],
    attendantId: "68ee98bffb0a4cae1444a53b",
    excludeContacts: ["Larissa", "Carolina"],
  },
  "Rose Oliveira": {
    instanceIds: ["69cabd2c728821965ff2ec6c"],
    attendantId: "68f7c1232a88c8678775e652",
    excludeContacts: [],
  },
  "Thiago Vergal": {
    instanceIds: ["6903bcb5283065e58ae9e02d", "69af170efdd45dca96468043"],
    attendantId: "690256afea582a43807bbcc5",
    excludeContacts: [],
  },
};

export const CONTATOS_INTERNOS = new Set([
  "5571984418277",
  "5571999993390",
  "5538999422501",
  "5571999358312",
  "5571991784570",
  "5571981828676",
  "5538999892908",
  "5571981334598",
  "5538984060320",
  "5571991943204",
  "5538999120486",
  "5571999448070",
  "5571999063460",
  "5577999441001",
  "5538998720798",
  "5571999186994",
  "5571988086490",
  "5571999853113",
  "5571997308385",
  "5571996321031",
  "5571987921408",
  "5571992843556",
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchConversas(
  instanceId: string,
  token: string,
  maxPages: number = 3 // Limita a 3 páginas (300 conversas) — API retorna as mais recentes primeiro
): Promise<any[]> {
  const allConversas: any[] = [];
  let skip = 0;
  const take = 100;
  const maxRetries = 2;
  let page = 0;

  while (true) {
    let attempt = 0;
    let res: Response | null = null;

    while (attempt < maxRetries) {
      const url = `${DATACRAZY_BASE_URL}/conversations?instanceId=${instanceId}&take=${take}&skip=${skip}`;
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 429) {
        attempt++;
        const backoff = 5000 * attempt; // 5s, 10s
        console.log(`[Datacrazy] 429 em fetchConversas (instance ${instanceId}), retry ${attempt}/${maxRetries} em ${backoff}ms`);
        if (attempt >= maxRetries) {
          console.warn(`[Datacrazy] rate limit persistente — retornando ${allConversas.length} conversas parciais`);
          return allConversas;
        }
        await delay(backoff);
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      throw new Error(
        `fetchConversas failed: ${res?.status} ${res?.statusText} for instanceId=${instanceId}`
      );
    }

    const data = await res.json();
    const items: any[] = Array.isArray(data) ? data : data.data ?? data.items ?? [];

    if (items.length === 0) break;

    for (const conversa of items) {
      // Skip groups
      if (conversa.isGroup === true) continue;

      // Skip if contactId is in internal contacts
      const contactId = conversa.contactId ?? conversa.contact?.id ?? "";
      const contactPhone =
        conversa.contact?.phone ??
        conversa.contact?.number ??
        conversa.phone ??
        "";
      if (CONTATOS_INTERNOS.has(contactPhone)) continue;

      // Skip hidden-only status
      const status = conversa.status ?? "";
      if (status === "hidden") continue;

      allConversas.push(conversa);
    }

    if (items.length < take) break;
    skip += take;
    page++;

    if (page >= maxPages) {
      console.log(`[Datacrazy] fetchConversas: limite de ${maxPages} paginas atingido (${allConversas.length} conversas)`);
      break;
    }

    await delay(1000); // Intervalo entre páginas
  }

  return allConversas;
}

export async function fetchMensagens(
  conversaId: string,
  token: string,
  maxPages: number = 1 // 1 pagina = 50 msgs max (suficiente para analise)
): Promise<any[]> {
  const allMensagens: any[] = [];
  let skip = 0;
  const take = 50;
  const maxRetries = 2;
  let page = 0;

  while (true) {
    let attempt = 0;
    let res: Response | null = null;

    while (attempt < maxRetries) {
      res = await fetch(
        `${DATACRAZY_BASE_URL}/conversations/${conversaId}/messages?take=${take}&skip=${skip}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (res.status === 429) {
        attempt++;
        const backoff = 5000 * attempt; // 5s, 10s
        console.log(`[Datacrazy] 429 em fetchMensagens (conversa ${conversaId}), retry ${attempt}/${maxRetries} em ${backoff}ms`);
        if (attempt >= maxRetries) {
          // Em vez de travar, retorna o que já tem e segue
          console.warn(`[Datacrazy] rate limit persistente — retornando ${allMensagens.length} mensagens parciais`);
          return allMensagens;
        }
        await delay(backoff);
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      throw new Error(
        `fetchMensagens failed: ${res?.status} ${res?.statusText} for conversaId=${conversaId}`
      );
    }

    const data = await res.json();
    const items: any[] = Array.isArray(data)
      ? data
      : data.messages ?? data.data ?? data.items ?? [];

    if (items.length === 0) break;

    allMensagens.push(...items);

    if (items.length < take) break;
    skip += take;
    page++;

    if (page >= maxPages) {
      console.log(`[Datacrazy] fetchMensagens: limite de ${maxPages} paginas (${allMensagens.length} msgs) para conversa ${conversaId}`);
      break;
    }

    await delay(5000);
  }

  return allMensagens;
}

export function filtrarConversasPorPeriodo(
  conversas: any[],
  inicio: Date,
  fim: Date
): any[] {
  return conversas.filter((conversa) => {
    const lastMsg =
      conversa.lastMessageDate ??
      conversa.updatedAt ??
      conversa.lastMessage?.createdAt;
    if (!lastMsg) return false;
    const d = new Date(lastMsg);
    return d >= inicio && d <= fim;
  });
}

export function buildTranscricao(
  mensagens: any[],
  nomeContato: string
): string {
  const linhas: string[] = [`[Conversa com ${nomeContato}]`];

  // Sort messages by date ascending
  const sorted = [...mensagens].sort((a, b) => {
    const da = new Date(a.createdAt ?? a.timestamp ?? 0).getTime();
    const db = new Date(b.createdAt ?? b.timestamp ?? 0).getTime();
    return da - db;
  });

  for (const msg of sorted) {
    const tipo = msg.type ?? msg.messageType ?? "";
    const received: boolean = msg.received !== undefined ? msg.received : msg.fromMe === false;
    const speaker = received ? "CLIENTE" : "VENDEDOR";

    // Unknown message type — skip
    if (tipo === "unknown_message_type") continue;

    // Audio or image — mark as non-analyzable
    if (
      tipo === "audio" ||
      tipo === "voice" ||
      tipo === "ptt" ||
      tipo === "image" ||
      tipo === "video" ||
      tipo === "document" ||
      tipo === "sticker"
    ) {
      linhas.push(`${speaker}: [midia nao analisavel]`);
      continue;
    }

    const body =
      msg.body ??
      msg.text ??
      msg.message?.conversation ??
      msg.message?.extendedTextMessage?.text ??
      "";

    if (!body || typeof body !== "string" || body.trim() === "") continue;

    linhas.push(`${speaker}: ${body.trim()}`);
  }

  return linhas.join("\n");
}
