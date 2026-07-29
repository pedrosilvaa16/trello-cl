"use client";

import type { ResumoMetrica } from "@/lib/estatisticas/agregar";
import { abreviar, comSinal, percentagem } from "@/lib/estatisticas/agregar";
import { cn } from "@/lib/utils";

/**
 * Um número do painel.
 *
 * Sem caixa, sem borda, sem fundo: é uma entrada de lista de definição, e o que
 * a separa da seguinte é espaço. Quatro molduras lado a lado dariam a um ecrã de
 * telemóvel mais linhas de borda do que de informação.
 *
 * A ordem é número, rótulo, variação — de cima para baixo, do mais para o menos
 * importante. É a ordem por que a pergunta é feita: primeiro "quantos", só
 * depois "quantos o quê".
 *
 * Três decisões que o mantêm honesto:
 *
 * · **O número é o número, não a percentagem.** Uma percentagem sem o valor a
 *   que se refere é uma frase sem sujeito.
 * · **A variação só aparece quando há com quê comparar.** Sem período anterior
 *   fica em branco, em vez de anunciar "+100%".
 * · **A cor não é a única codificação.** Vem sempre com o sinal escrito, para
 *   quem não distingue verde de vermelho ler o mesmo.
 */
export function Estatistica({ resumo }: { resumo: ResumoMetrica }) {
  const subiu = (resumo.variacao ?? 0) > 0;
  const desceu = (resumo.variacao ?? 0) < 0;

  return (
    <div className="min-w-0">
      <dd
        className="text-[30px] leading-none font-normal tracking-tight text-texto tabular-nums sm:text-[34px]"
        data-numerico
      >
        {abreviar(resumo.valor)}
      </dd>

      <dt className="mt-2 truncate text-[13px] text-texto-suave" title={resumo.ajuda}>
        {resumo.nome}
      </dt>

      {/*
        Uma linha só, e curta.

        Antes dizia "+85  +73% face ao período anterior" e no telemóvel partia
        em duas linhas, desalinhando a grelha toda. A frase saiu daqui e passou
        a ser dita uma vez debaixo dos quatro números, em `painel.tsx` — quatro
        repetições da mesma explicação era exatamente o ruído que se queria tirar.

        Numa métrica acumulada mostram-se os dois: "523 seguidores" é o saldo,
        "+85" é o trabalho deste mês, e "+73%" diz se foi melhor do que o
        anterior. Numa diária o total já é o trabalho, e sobra a percentagem.
      */}
      <p className="mt-1.5 flex min-h-4 items-baseline gap-1.5 text-xs">
        {resumo.crescimento !== null && resumo.crescimento !== 0 && (
          <span className="font-medium text-texto" data-numerico>
            {comSinal(resumo.crescimento)}
          </span>
        )}

        {resumo.variacao !== null && (subiu || desceu) && (
          <span
            className={cn(
              "font-medium",
              subiu ? "text-[var(--cor-sucesso)]" : "text-[var(--cor-perigo)]",
            )}
            data-numerico
          >
            {subiu ? "+" : "−"}
            {percentagem(Math.abs(resumo.variacao), 0)}
          </span>
        )}
      </p>
    </div>
  );
}
