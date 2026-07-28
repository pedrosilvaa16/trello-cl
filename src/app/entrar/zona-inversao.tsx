"use client";

import * as React from "react";

/*
  Zona de inversão — o efeito do hero do site.

  Duas camadas com exatamente o mesmo conteúdo: a base em tinta e uma cópia em
  papel recortada a um círculo escuro que persegue o rato. `children` é
  renderizado duas vezes de propósito; a segunda cópia é `aria-hidden` e não tem
  nada de focável lá dentro, por isso não chega ao teclado nem ao leitor de ecrã.

  O rato só guarda a posição-alvo; um único requestAnimationFrame interpola e
  pára quando estabiliza. Sem rato, com movimento reduzido ou em ecrã pequeno, o
  círculo fica onde o CSS o pôs e não corre JavaScript nenhum.
*/

/** Fator de perseguição por frame — menor é mais arrasto. */
const PERSEGUIR = 0.09;

export function ZonaInversao({ children }: { children: React.ReactNode }) {
  const zona = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const alvo = zona.current;
    if (!alvo) return;

    const podeApontar = window.matchMedia("(hover: hover) and (pointer: fine)");
    const menosMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ecraPequeno = window.matchMedia("(max-width: 1023px)");
    if (!podeApontar.matches || menosMovimento.matches || ecraPequeno.matches) {
      return;
    }

    const titulo = alvo.querySelector<HTMLElement>(".titulo");
    if (!titulo) return;

    const pousar = () => {
      const z = alvo.getBoundingClientRect();
      const t = titulo.getBoundingClientRect();
      return {
        x: t.left - z.left + t.width * 0.45,
        y: t.top - z.top + t.height * 0.5,
      };
    };

    const escrever = (x: number, y: number) => {
      alvo.style.setProperty("--cx", `${x}px`);
      alvo.style.setProperty("--cy", `${y}px`);
    };

    let atual = pousar();
    let destino = { ...atual };
    escrever(atual.x, atual.y);

    let raf: number | null = null;

    const passo = () => {
      atual.x += (destino.x - atual.x) * PERSEGUIR;
      atual.y += (destino.y - atual.y) * PERSEGUIR;
      escrever(atual.x, atual.y);

      if (
        Math.abs(destino.x - atual.x) > 0.3 ||
        Math.abs(destino.y - atual.y) > 0.3
      ) {
        raf = requestAnimationFrame(passo);
      } else {
        escrever(destino.x, destino.y);
        atual = { ...destino };
        raf = null;
      }
    };

    const acordar = () => {
      if (raf === null) raf = requestAnimationFrame(passo);
    };

    const painel = alvo.closest("section") ?? alvo;

    const aoMover = (evento: MouseEvent) => {
      const z = alvo.getBoundingClientRect();
      destino = { x: evento.clientX - z.left, y: evento.clientY - z.top };
      acordar();
    };

    const aoSair = () => {
      destino = pousar();
      acordar();
    };

    const aoRedimensionar = () => {
      atual = pousar();
      destino = { ...atual };
      escrever(atual.x, atual.y);
    };

    painel.addEventListener("mousemove", aoMover as EventListener);
    painel.addEventListener("mouseleave", aoSair);
    window.addEventListener("resize", aoRedimensionar);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      painel.removeEventListener("mousemove", aoMover as EventListener);
      painel.removeEventListener("mouseleave", aoSair);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, []);

  return (
    <div ref={zona} className="zona-inversao">
      <span className="zi-circulo" aria-hidden />

      {/* Camada base — é esta que define o tamanho da zona. */}
      <div className="zi-camada">{children}</div>

      {/* Cópia em papel, recortada ao círculo. */}
      <div className="zi-camada zi-invertida" aria-hidden>
        {children}
      </div>
    </div>
  );
}
