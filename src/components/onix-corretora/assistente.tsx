"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Bot, X, Send } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const MENSAGEM_INICIAL: Message = {
  role: "assistant",
  content: `Ola! Sou seu assistente de analise comercial.\n\nPosso te ajudar a interpretar os dados do time, identificar padroes, sugerir melhorias no processo de analise ou calibrar os prompts para cada perfil PAT.\n\nO que voce quer explorar?`,
};

const SUGESTOES = [
  "Como esta o desempenho do time?",
  "Sugira melhorias para o relatorio do Eduardo",
  "Quais padroes se repetem nas objecoes?",
  "Como calibrar melhor o termometro?",
];

function renderMessageContent(content: string): React.ReactNode {
  // Split by code blocks first
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      const before = content.slice(lastIndex, match.index);
      parts.push(
        <span key={key++}>
          {before.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </span>
      );
    }

    // Add code block
    parts.push(
      <pre
        key={key++}
        className="bg-black/10 rounded p-2 text-xs overflow-x-auto mt-2 whitespace-pre-wrap"
      >
        {match[1]}
      </pre>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    parts.push(
      <span key={key++}>
        {remaining.split("\n").map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
      </span>
    );
  }

  return <>{parts}</>;
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
        style={{ animationDelay: "150ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce"
        style={{ animationDelay: "300ms" }}
      />
    </div>
  );
}

export function Assistente() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([MENSAGEM_INICIAL]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isInitialState = messages.length === 1 && messages[0].role === "assistant";

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = 4 * 24; // 4 rows * approx 24px per row
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }

  const enviar = useCallback(
    async (texto: string) => {
      const trimmed = texto.trim();
      if (!trimmed || loading) return;

      const novaMsg: Message = { role: "user", content: trimmed };
      const novasMensagens = [...messages, novaMsg];
      setMessages(novasMensagens);
      setInput("");
      setLoading(true);

      // Add empty assistant message for streaming
      const msgComAssistente: Message[] = [
        ...novasMensagens,
        { role: "assistant", content: "" },
      ];
      setMessages(msgComAssistente);

      try {
        const response = await fetch("/api/onix-corretora/assistente", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: novasMensagens }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          setMessages([
            ...novasMensagens,
            {
              role: "assistant",
              content: `Erro ao conectar com o assistente: ${errorText}`,
            },
          ]);
          setLoading(false);
          return;
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let assistantMsg = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantMsg += decoder.decode(value, { stream: true });
          setMessages([
            ...novasMensagens,
            { role: "assistant", content: assistantMsg },
          ]);
        }
      } catch (err: any) {
        setMessages([
          ...novasMensagens,
          {
            role: "assistant",
            content: `Erro de conexao: ${err.message ?? "tente novamente."}`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(input);
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir Assistente IA"
        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary shadow-lg hover:bg-primary/90 flex items-center justify-center transition-all"
        style={{ boxShadow: "0 4px 24px 0 rgba(0,0,0,0.25)" }}
      >
        <Bot className="h-6 w-6 text-primary-foreground" />
        <span className="absolute -top-1 -right-1 bg-primary-foreground text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          IA
        </span>
      </button>

      {/* Sliding panel */}
      <div
        ref={panelRef}
        className={`fixed right-0 top-0 h-screen bg-card shadow-2xl border-l border-border z-40 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "400px" }}
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="bg-primary/5 border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-tight">Assistente IA</p>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Analise comercial · Onix Corretora
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Fechar assistente"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-sidebar-accent text-foreground rounded-tl-sm"
                }`}
              >
                {msg.content === "" && msg.role === "assistant" ? (
                  <TypingIndicator />
                ) : (
                  renderMessageContent(msg.content)
                )}
              </div>
            </div>
          ))}

          {loading && messages[messages.length - 1]?.content !== "" && (
            <div className="flex justify-start">
              <div className="bg-sidebar-accent rounded-2xl rounded-tl-sm">
                <TypingIndicator />
              </div>
            </div>
          )}

          {/* Suggested questions */}
          {isInitialState && !loading && (
            <div className="flex flex-col gap-2 pt-2">
              {SUGESTOES.map((sugestao) => (
                <button
                  key={sugestao}
                  onClick={() => enviar(sugestao)}
                  className="text-left text-xs px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-primary/5 hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {sugestao}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-border px-4 py-3 flex gap-2 items-end shrink-0">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            placeholder="Escreva sua pergunta..."
            className="flex-1 resize-none bg-sidebar-accent text-foreground text-sm placeholder:text-muted-foreground rounded-xl px-3 py-2.5 border border-border focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 overflow-hidden"
            style={{ minHeight: "40px", maxHeight: "96px" }}
          />
          <button
            onClick={() => enviar(input)}
            disabled={loading || !input.trim()}
            className="bg-primary text-primary-foreground rounded-lg p-2.5 hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            aria-label="Enviar mensagem"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Overlay for mobile (click to close) */}
      {open && (
        <div
          className="fixed inset-0 z-30 sm:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
