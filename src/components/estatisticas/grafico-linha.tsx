"use client";

import * as React from "react";

import type { Ponto } from "@/lib/estatisticas/agregar";
import { porExtenso } from "@/lib/estatisticas/agregar";
import { cn } from "@/lib/utils";

import { indicesDoEixo, rotularDia, tectoRedondo, useLargura } from "./medir";

/**
 * A evolução de uma métrica ao longo do período.
 *
 * Série única, e por isso sem legenda: o título do cartão já diz o que a linha
 * é, e uma caixa a repeti-lo seria ruído. A cor é `--grafico-1` e não uma
 * escolhida por rank — a linha é a mesma métrica em qualquer filtro.
 *
 * Desenhado à largura medida (ver `medir.ts`), o que mantém os 2px da linha e o
 * tamanho do texto iguais no telemóvel e no computador.
 */
export function GraficoLinha({
  pontos,
  altura = 200,
  rotulo,
  className,
}: {
  pontos: Ponto[];
  altura?: number;
  /** O nome da métrica, para a descrição de acessibilidade e para a legenda. */
  rotulo: string;
  className?: string;
}) {
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const [ativo, definirAtivo] = React.useState<number | null>(null);

  // Espaço para os números à esquerda e para as datas em baixo.
  const margem = { cima: 12, direita: 8, baixo: 22, esquerda: 40 };
  const larguraGrafico = Math.max(0, largura - margem.esquerda - margem.direita);
  const alturaGrafico = altura - margem.cima - margem.baixo;

  const maximo = tectoRedondo(Math.max(...pontos.map((p) => p.valor), 0));

  /*
    O mínimo é zero de propósito, mesmo numa métrica que anda entre 500 e 523.

    Cortar o eixo faria essa subida de 23 seguidores parecer uma explosão — é a
    forma mais comum de um gráfico honesto contar uma mentira, e num painel que
    se mostra ao cliente não entra. Quem quiser ver o detalhe da variação tem o
    número de crescimento no cartão, escrito por extenso.
  */
  const x = (i: number) =>
    margem.esquerda +
    (pontos.length <= 1 ? larguraGrafico / 2 : (i / (pontos.length - 1)) * larguraGrafico);
  const y = (valor: number) =>
    margem.cima + alturaGrafico - (valor / maximo) * alturaGrafico;

  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.valor)}`).join(" ");

  const grelha = [0, 0.5, 1].map((fracao) => ({
    valor: maximo * fracao,
    y: margem.cima + alturaGrafico * (1 - fracao),
  }));

  const eixoX = indicesDoEixo(pontos.length, larguraGrafico);

  /** Converte a posição do ponteiro no índice mais próximo. Serve rato e dedo. */
  function aoApontar(evento: React.PointerEvent<SVGSVGElement>) {
    if (pontos.length === 0 || larguraGrafico <= 0) return;
    const caixaSvg = evento.currentTarget.getBoundingClientRect();
    const posicao = evento.clientX - caixaSvg.left - margem.esquerda;
    const indice = Math.round((posicao / larguraGrafico) * (pontos.length - 1));
    definirAtivo(Math.min(Math.max(indice, 0), pontos.length - 1));
  }

  const destacado = ativo !== null ? pontos[ativo] : null;

  return (
    <div ref={caixa} className={cn("relative w-full", className)}>
      {largura > 0 && (
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={`${rotulo}: ${pontos.length} dias, de ${porExtenso(pontos[0]?.valor ?? 0)} a ${porExtenso(pontos[pontos.length - 1]?.valor ?? 0)}.`}
          className="touch-pan-y select-none"
          onPointerMove={aoApontar}
          onPointerLeave={() => definirAtivo(null)}
        >
          {/* Grelha e números: referência, e por isso recessivos. */}
          {grelha.map((linha) => (
            <g key={linha.y}>
              <line
                x1={margem.esquerda}
                x2={largura - margem.direita}
                y1={linha.y}
                y2={linha.y}
                stroke="var(--grafico-grelha)"
                strokeWidth={1}
              />
              <text
                x={margem.esquerda - 8}
                y={linha.y + 4}
                textAnchor="end"
                className="fill-texto-tenue text-[10px]"
                data-numerico
              >
                {porExtenso(linha.valor)}
              </text>
            </g>
          ))}

          {/*
            Sem véu por baixo da linha.

            Com o eixo a começar em zero — e ele TEM de começar em zero, senão
            uma subida de 23 seguidores parece uma explosão — uma conta de 600
            seguidores num eixo até 750 enche quatro quintos do gráfico. O véu
            deixava de ser um acento e passava a ser um bloco de cor a ocupar a
            página inteira. A linha sozinha diz o mesmo e não pesa nada.
          */}
          <path
            d={caminho}
            fill="none"
            stroke="var(--grafico-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {eixoX.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={altura - 6}
              textAnchor={i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"}
              className="fill-texto-tenue text-[10px]"
            >
              {rotularDia(pontos[i].dia)}
            </text>
          ))}

          {destacado && ativo !== null && (
            <g>
              <line
                x1={x(ativo)}
                x2={x(ativo)}
                y1={margem.cima}
                y2={margem.cima + alturaGrafico}
                stroke="var(--cor-borda-forte)"
                strokeWidth={1}
              />
              {/*
                O anel da cor da superfície separa o ponto da linha por baixo —
                sem ele, o marcador funde-se com a série e deixa de se ver onde
                está.
              */}
              <circle
                cx={x(ativo)}
                cy={y(destacado.valor)}
                r={5}
                fill="var(--grafico-1)"
                stroke="var(--cor-superficie)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
      )}

      {/*
        A legenda flutuante é HTML e não SVG: o texto fica mais nítido, herda a
        tipografia da casa e não precisa de ser medido à mão.
      */}
      {destacado && ativo !== null && largura > 0 && (
        <div
          /*
            Plana e encostada, sem sombra nem cantos redondos: uma etiqueta que
            paira sobre o gráfico com relevo próprio rouba-lhe a atenção, e o
            que se quer ler é a linha.
          */
          className="pointer-events-none absolute z-10 -translate-x-1/2 border border-borda bg-superficie px-2 py-1"
          style={{
            // Preso às margens para não sair do cartão nas pontas.
            left: Math.min(Math.max(x(ativo), 60), largura - 60),
            top: 0,
          }}
        >
          <p className="text-[11px] text-texto-tenue">{rotularDia(destacado.dia, "longo")}</p>
          <p className="text-sm font-semibold text-texto" data-numerico>
            {porExtenso(destacado.valor)}
          </p>
        </div>
      )}
    </div>
  );
}
