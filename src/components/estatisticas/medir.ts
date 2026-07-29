"use client";

import * as React from "react";

/**
 * A largura real de um elemento, em píxeis.
 *
 * Existe por causa de uma armadilha do SVG responsivo: dar-lhe um `viewBox`
 * fixo e `width: 100%` faz o desenho todo escalar — incluindo o texto. Num
 * telemóvel a 360px, um gráfico desenhado para 800px fica com rótulos de sete
 * píxeis, ilegíveis; num ecrã largo ficam enormes.
 *
 * Medir e desenhar às medidas certas resolve isso de vez: as linhas mantêm 2px
 * em qualquer largura e o texto mantém o tamanho que a folha de estilos diz.
 *
 * Devolve 0 antes da primeira medição, e quem chama não desenha nada nesse
 * render. É um frame, e é preferível a desenhar com uma largura adivinhada e
 * ver o gráfico saltar a seguir.
 */
export function useLargura<T extends HTMLElement>() {
  const referencia = React.useRef<T>(null);
  const [largura, definirLargura] = React.useState(0);

  React.useEffect(() => {
    const elemento = referencia.current;
    if (!elemento) return;

    const observador = new ResizeObserver(([entrada]) => {
      /*
        `contentRect` e não `getBoundingClientRect()`: o primeiro já exclui o
        padding, e é o espaço em que o desenho cabe mesmo. Arredondar para baixo
        evita meio píxel de sobra a provocar uma barra de deslocamento
        horizontal que aparece e desaparece.
      */
      definirLargura(Math.floor(entrada.contentRect.width));
    });

    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return [referencia, largura] as const;
}

/**
 * O rótulo de uma data no eixo.
 *
 * `curto` para o eixo — "14 jul" cabe onde "14 de julho de 2026" não cabe — e a
 * forma longa para a legenda que aparece ao passar o rato, onde há espaço e a
 * precisão ajuda.
 */
export function rotularDia(dia: string, formato: "curto" | "longo" = "curto") {
  const data = new Date(`${dia}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-PT", {
    day: "numeric",
    month: formato === "curto" ? "short" : "long",
    ...(formato === "longo" ? { year: "numeric" } : {}),
  })
    .format(data)
    .replace(".", "");
}

/**
 * Quantos rótulos cabem no eixo horizontal, e quais.
 *
 * Sem isto, trinta dias davam trinta rótulos sobrepostos num telemóvel. Escolhe
 * um passo que caiba na largura disponível e garante que o último dia aparece
 * sempre — é o que a pessoa procura primeiro.
 */
export function indicesDoEixo(total: number, largura: number): number[] {
  if (total === 0) return [];

  // ~64px por rótulo é o que "14 jul" precisa para não encostar ao vizinho.
  const cabem = Math.max(2, Math.floor(largura / 64));
  const passo = Math.max(1, Math.ceil(total / cabem));

  const indices: number[] = [];
  for (let i = 0; i < total; i += passo) indices.push(i);

  const ultimo = total - 1;
  if (indices[indices.length - 1] !== ultimo) {
    // Se o penúltimo ficasse colado ao último, troca-se em vez de acumular.
    if (ultimo - indices[indices.length - 1] < passo / 2) indices.pop();
    indices.push(ultimo);
  }
  return indices;
}

/**
 * Um tecto "redondo" para o eixo vertical.
 *
 * Um eixo que acabasse em 4237 daria linhas de grelha em 1412 e 2824, e ninguém
 * lê isso de relance. Sobe-se ao 1, 2, 2.5 ou 5 seguinte da mesma ordem de
 * grandeza, que é como um humano arredondaria.
 */
export function tectoRedondo(maximo: number): number {
  if (maximo <= 0) return 1;

  const ordem = 10 ** Math.floor(Math.log10(maximo));
  const normalizado = maximo / ordem;

  const degrau = [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10].find((d) => normalizado <= d) ?? 10;
  return degrau * ordem;
}
