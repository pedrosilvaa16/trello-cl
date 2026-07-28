"use client";

import * as React from "react";

export const ATALHOS = [
  { teclas: ["/"], descricao: "Pesquisar no quadro" },
  { teclas: ["x"], descricao: "Limpar os filtros" },
  { teclas: ["n"], descricao: "Nova lista" },
  { teclas: ["Esc"], descricao: "Fechar o cartão ou o painel aberto" },
  { teclas: ["?"], descricao: "Mostrar esta lista" },
] as const;

/** O utilizador está a escrever? Aí os atalhos de uma tecla não existem. */
function aEscrever(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false;
  return (
    alvo.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)
  );
}

/**
 * Atalhos de teclado do quadro.
 *
 * Uma tecla só, sem modificadores: numa ferramenta usada o dia inteiro, os
 * dedos aprendem-nas. Nunca disparam com um campo em foco nem com um
 * modificador carregado — Ctrl+N é do browser e assim continua.
 */
export function useAtalhos({
  aoPesquisar,
  aoLimparFiltros,
  aoFechar,
  aoNovaLista,
  aoMostrarAjuda,
  ativo = true,
}: {
  aoPesquisar?: () => void;
  aoLimparFiltros?: () => void;
  aoFechar?: () => void;
  aoNovaLista?: () => void;
  aoMostrarAjuda?: () => void;
  ativo?: boolean;
}) {
  // As ações mudam a cada render; o ouvinte de teclado não. A ref é atualizada
  // depois do render (nunca durante) e lida só quando uma tecla é carregada.
  const acoes = React.useRef({
    aoPesquisar,
    aoLimparFiltros,
    aoFechar,
    aoNovaLista,
    aoMostrarAjuda,
  });

  React.useEffect(() => {
    acoes.current = {
      aoPesquisar,
      aoLimparFiltros,
      aoFechar,
      aoNovaLista,
      aoMostrarAjuda,
    };
  });

  React.useEffect(() => {
    function aoCarregar(evento: KeyboardEvent) {
      // Escape funciona mesmo a escrever: é a saída de emergência.
      if (evento.key === "Escape") {
        acoes.current.aoFechar?.();
        return;
      }

      if (!ativo) return;
      if (evento.metaKey || evento.ctrlKey || evento.altKey) return;
      if (aEscrever(evento.target)) return;

      switch (evento.key) {
        case "/":
          evento.preventDefault();
          acoes.current.aoPesquisar?.();
          break;
        case "x":
          acoes.current.aoLimparFiltros?.();
          break;
        case "n":
          acoes.current.aoNovaLista?.();
          break;
        case "?":
          acoes.current.aoMostrarAjuda?.();
          break;
      }
    }

    window.addEventListener("keydown", aoCarregar);
    return () => window.removeEventListener("keydown", aoCarregar);
  }, [ativo]);
}
