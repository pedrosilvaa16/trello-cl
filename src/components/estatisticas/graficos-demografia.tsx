"use client";

import * as React from "react";

import type { FatiaDemografica } from "@/lib/estatisticas/agregar";
import { percentagem, porExtenso } from "@/lib/estatisticas/agregar";
import { cn } from "@/lib/utils";

import { tectoRedondo, useLargura } from "./medir";

/**
 * Os gráficos de demografia: anel, barras verticais e barras horizontais.
 *
 * Estão no mesmo ficheiro porque partilham a mesma decisão de fundo — o que é
 * uma distribuição, como se rotula e quando se mostra a tabela em vez do
 * desenho. Separá-los em três daria três cópias das mesmas trinta linhas.
 *
 * Regra que atravessa os três: **a cor nunca é a única codificação**. Cada
 * fatia e cada barra tem o nome escrito ao lado. Quem não distingue as cores lê
 * o gráfico à mesma, e quem o vê impresso a preto e branco também.
 */

/* --------------------------------------------------------------- tabela */

/**
 * A vista de tabela.
 *
 * Não é um extra de acessibilidade pendurado: é o que o Metricool tem, é o que
 * uma agência copia para um relatório, e é a única forma de ler os valores
 * exatos de uma fatia de 2%.
 */
function Tabela({ fatias, titulo }: { fatias: FatiaDemografica[]; titulo: string }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{titulo}</caption>
      <thead>
        <tr className="border-b border-borda text-left text-xs text-texto-tenue">
          <th scope="col" className="pb-1.5 font-medium">
            Grupo
          </th>
          <th scope="col" className="pb-1.5 text-right font-medium">
            Percentagem
          </th>
        </tr>
      </thead>
      <tbody>
        {fatias.map((fatia) => (
          <tr key={fatia.grupo} className="border-b border-borda/60 last:border-0">
            <td className="py-1.5 text-texto">{fatia.grupo}</td>
            <td className="py-1.5 text-right text-texto-suave" data-numerico>
              {percentagem(fatia.fracao * 100)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * O botão que troca entre o desenho e a tabela.
 *
 * Texto e não ícone: um par de símbolos a alternar obriga a decifrar qual é
 * qual, e "Ver tabela" não obriga a nada.
 */
function AlternarVista({
  tabela,
  aoAlternar,
}: {
  tabela: boolean;
  aoAlternar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoAlternar}
      className={cn(
        "text-[12px] text-texto-tenue underline-offset-4",
        "transition-colors duration-[var(--duracao-rapida)] hover:text-texto hover:underline",
      )}
    >
      {tabela ? "Ver gráfico" : "Ver tabela"}
    </button>
  );
}

export function Bloco({
  titulo,
  fatias,
  children,
}: {
  titulo: string;
  fatias: FatiaDemografica[];
  /* Função e não nó: assim o gráfico não é construído quando a tabela está à vista. */
  children: () => React.ReactNode;
}) {
  const [tabela, definirTabela] = React.useState(false);

  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-texto">{titulo}</h3>
        {fatias.length > 0 && (
          <AlternarVista tabela={tabela} aoAlternar={() => definirTabela((v) => !v)} />
        )}
      </div>
      {fatias.length === 0 ? (
        <p className="text-sm text-texto-tenue">Sem dados para este período.</p>
      ) : tabela ? (
        <Tabela fatias={fatias} titulo={titulo} />
      ) : (
        children()
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ anel */

/**
 * O anel, para o género.
 *
 * Anel e não tarte: o buraco no meio dá sítio ao total, e comparar arcos é
 * igualmente difícil nos dois — o que salva a leitura é a percentagem escrita
 * na legenda, não a forma.
 *
 * Só para três ou quatro fatias. Acima disso um anel deixa de se ler e as
 * barras horizontais fazem melhor o trabalho — é por isso que os países e as
 * cidades não usam isto.
 */
export function GraficoAnel({
  fatias,
  cores,
  total,
}: {
  fatias: FatiaDemografica[];
  /** Uma cor por fatia, na ordem delas. */
  cores: string[];
  /** O que escrever no meio. Costuma ser o número de seguidores. */
  total?: string;
}) {
  const tamanho = 128;
  const raio = 52;
  const espessura = 12;
  const centro = tamanho / 2;
  const perimetro = 2 * Math.PI * raio;

  /*
    Os arcos calculam-se antes do JSX, e não com um acumulador dentro do `map`.
    Mutar uma variável a meio de um render é justamente o que o compilador do
    React proíbe — e com razão: o resultado passaria a depender de o `map` correr
    uma vez ou duas.
  */
  const arcos = fatias.reduce<{ fatia: FatiaDemografica; inicio: number; comprimento: number }[]>(
    (acumulado, fatia) => {
      const anterior = acumulado[acumulado.length - 1];
      const inicio = anterior ? anterior.inicio + anterior.comprimento : 0;
      return [...acumulado, { fatia, inicio, comprimento: fatia.fracao * perimetro }];
    },
    [],
  );

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        width={tamanho}
        height={tamanho}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        role="img"
        aria-label={fatias
          .map((f) => `${f.grupo}: ${percentagem(f.fracao * 100)}`)
          .join(", ")}
        className="shrink-0"
      >
        <g transform={`rotate(-90 ${centro} ${centro})`}>
          {arcos.map((arco, indice) => (
            <circle
              key={arco.fatia.grupo}
              cx={centro}
              cy={centro}
              r={raio}
              fill="none"
              stroke={cores[indice] ?? "var(--grafico-neutro)"}
              strokeWidth={espessura}
              /*
                Dois píxeis a menos no arco abrem uma falha da cor da superfície
                entre fatias. Sem ela, duas fatias vizinhas de cores próximas
                parecem uma só.
              */
              strokeDasharray={`${Math.max(arco.comprimento - 2, 0)} ${perimetro}`}
              strokeDashoffset={-arco.inicio}
            />
          ))}
        </g>
        {total && (
          <text
            x={centro}
            y={centro + 5}
            textAnchor="middle"
            className="fill-texto text-[15px] font-semibold"
            data-numerico
          >
            {total}
          </text>
        )}
      </svg>

      {/* A legenda com o nome e a percentagem: é ela que torna o anel legível. */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {fatias.map((fatia, indice) => (
          <li key={fatia.grupo} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0"
              style={{ background: cores[indice] ?? "var(--grafico-neutro)" }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-texto-suave">{fatia.grupo}</span>
            <span className="shrink-0 font-medium text-texto" data-numerico>
              {percentagem(fatia.fracao * 100)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------- barras verticais */

/**
 * Barras verticais, para os escalões etários.
 *
 * Verticais porque a ordem tem significado — os escalões lêem-se do mais novo
 * para o mais velho, como uma linha do tempo — e uma sequência ordenada lê-se
 * melhor deitada da esquerda para a direita.
 */
export function GraficoBarras({ fatias }: { fatias: FatiaDemografica[] }) {
  const [caixa, largura] = useLargura<HTMLDivElement>();
  const altura = 170;
  const margemBaixo = 20;
  const alturaBarras = altura - margemBaixo - 14;

  const maximo = tectoRedondo(Math.max(...fatias.map((f) => f.fracao * 100), 0));
  // 2px de intervalo entre barras vizinhas, como manda o espaçamento da casa.
  const passo = fatias.length > 0 ? largura / fatias.length : 0;
  const larguraBarra = Math.max(passo - 8, 4);

  return (
    <div ref={caixa} className="w-full">
      {largura > 0 && (
        <svg
          width={largura}
          height={altura}
          role="img"
          aria-label={fatias
            .map((f) => `${f.grupo}: ${percentagem(f.fracao * 100)}`)
            .join(", ")}
        >
          {fatias.map((fatia, indice) => {
            const valor = fatia.fracao * 100;
            const alturaValor = Math.max((valor / maximo) * alturaBarras, valor > 0 ? 2 : 0);
            const x = indice * passo + (passo - larguraBarra) / 2;
            const y = 14 + alturaBarras - alturaValor;

            return (
              <g key={fatia.grupo}>
                <rect
                  x={x}
                  y={y}
                  width={larguraBarra}
                  height={alturaValor}
                  /*
                    Cantos retos. Um provete arredondado lê-se como componente de
                    interface; uma barra reta lê-se como medida — e a base tem de
                    ficar encostada à linha zero, senão parece flutuar acima do
                    eixo e falseia a leitura.
                  */
                  fill="var(--grafico-1)"
                />
                {/*
                  Rótulo direto só onde a barra tem expressão. Um número em cima
                  de todas as barras, incluindo as de 1%, transforma o gráfico
                  numa tabela mal desenhada.
                */}
                {fatia.fracao > 0.08 && (
                  <text
                    x={x + larguraBarra / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="fill-texto-suave text-[10px] font-medium"
                    data-numerico
                  >
                    {Math.round(valor)}%
                  </text>
                )}
                <text
                  x={x + larguraBarra / 2}
                  y={altura - 5}
                  textAnchor="middle"
                  className="fill-texto-tenue text-[10px]"
                >
                  {fatia.grupo}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* --------------------------------------------------- barras horizontais */

/**
 * Barras horizontais, para países e cidades.
 *
 * Horizontais porque os rótulos são nomes — "Marco de Canaveses, Porto
 * District" não cabe debaixo de uma barra vertical sem ser rodado, e texto
 * rodado não se lê. Ordenadas por tamanho, que é a ordem com significado aqui.
 *
 * Cor única: isto é magnitude, não identidade. Sete cores para sete cidades
 * seria pedir a quem lê que decorasse uma legenda para responder a "qual é a
 * maior", quando o comprimento da barra já responde.
 */
export function BarrasHorizontais({
  fatias,
  formatar = (f: FatiaDemografica) => percentagem(f.fracao * 100),
}: {
  fatias: FatiaDemografica[];
  formatar?: (fatia: FatiaDemografica) => string;
}) {
  const maior = Math.max(...fatias.map((f) => f.fracao), 0.0001);

  return (
    <ul className="space-y-2.5">
      {fatias.map((fatia) => (
        <li key={fatia.grupo}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-texto">{fatia.grupo}</span>
            <span
              className="shrink-0 text-sm font-medium text-texto-suave"
              data-numerico
            >
              {formatar(fatia)}
            </span>
          </div>
          {/*
            A calha por baixo mostra a escala: sem ela, uma barra a 40% da
            largura e outra a 80% comparam-se, mas nenhuma diz quanto falta
            para o topo.
          */}
          <div className="h-1.5 w-full bg-superficie-3" role="presentation">
            <div
              className="h-full bg-[var(--grafico-1)] transition-[width] duration-[var(--duracao-arrasto)] ease-[var(--curva)]"
              style={{ width: `${(fatia.fracao / maior) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Formata uma fatia como contagem em vez de percentagem. */
export function comoContagem(fatia: FatiaDemografica) {
  return porExtenso(fatia.valor);
}
