"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

/* ──────────────────────────────────────────────────────────────
 * Tema como STORE EXTERNA, não como estado de React.
 *
 * O tema não é estado da aplicação: ele mora no `localStorage` e no
 * `prefers-color-scheme` do sistema — dois lugares que mudam sem passar pelo
 * React (outra aba, o SO virando para escuro à noite). `useSyncExternalStore`
 * é a API própria para isso.
 *
 * A versão anterior lia com `useEffect` + `setState`, o que custava três
 * coisas: um render com o tema errado antes de corrigir (visível, e o hub é a
 * primeira tela do dia), um erro de `react-hooks/set-state-in-effect` que
 * prendia qualquer PR que tocasse este arquivo, e nenhuma reação a mudança
 * vinda de fora. É o mesmo padrão que já tinha custado caro na sidebar — a
 * nota em `moduloAnterior` (sidebar.tsx) narra o episódio.
 *
 * A classe no `<html>` é aplicada FORA do render: no `subscribe` (mudança do
 * sistema ou de outra aba) e no handler do clique. Nunca em efeito. Na
 * primeira pintura quem aplica é o script inline de `layout.tsx`, que roda
 * antes do React — por isso não há flash.
 * ────────────────────────────────────────────────────────────── */

const CHAVE = "onix-theme";
const CONSULTA_ESCURO = "(prefers-color-scheme: dark)";

/** Ouvintes locais: escrita de `localStorage` na MESMA aba não dispara `storage`. */
const ouvintes = new Set<() => void>();

function avisarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte();
}

function assinarTema(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);

  // Outra aba trocou o tema.
  const aoStorage = (e: StorageEvent) => {
    if (e.key !== CHAVE) return;
    aplicarTema(lerTema());
    aoMudar();
  };
  window.addEventListener("storage", aoStorage);

  // O SISTEMA trocou de claro para escuro. Só vale quando não há preferência
  // explícita salva — escolha do usuário ganha da do sistema.
  const mql = window.matchMedia(CONSULTA_ESCURO);
  const aoSistema = () => {
    if (localStorage.getItem(CHAVE)) return;
    aplicarTema(lerTema());
    aoMudar();
  };
  mql.addEventListener("change", aoSistema);

  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoStorage);
    mql.removeEventListener("change", aoSistema);
  };
}

/**
 * O tema efetivo AGORA. Devolve string (primitivo), então comparar por valor
 * basta e não há risco do laço infinito que um objeto novo a cada leitura
 * causaria em `useSyncExternalStore`.
 *
 * Mesma precedência do script inline de `layout.tsx`: salvo ganha do sistema.
 */
function lerTema(): Theme {
  try {
    const salvo = localStorage.getItem(CHAVE);
    if (salvo === "dark" || salvo === "light") return salvo;
    return window.matchMedia(CONSULTA_ESCURO).matches ? "dark" : "light";
  } catch {
    // localStorage bloqueado (modo restrito do navegador) — não é motivo para
    // a aplicação inteira falhar ao montar.
    return "light";
  }
}

/** No servidor não existe `localStorage` nem `matchMedia`. */
function lerTemaNoServidor(): Theme {
  return "light";
}

function aplicarTema(theme: Theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(assinarTema, lerTema, lerTemaNoServidor);

  const toggleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    aplicarTema(next);
    try {
      localStorage.setItem(CHAVE, next);
    } catch {
      // Sem persistência a troca ainda vale nesta sessão.
    }
    avisarOuvintes();
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
