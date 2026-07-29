"use client";

import { Copy, Eye, Loader2, PanelRightClose, RefreshCw } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import type { ContextoMontado } from "@/lib/contexto";
import { cn } from "@/lib/utils";

/**
 * «O que a AI vê», sempre à vista.
 *
 * Numa página que rola, isto ficava no fim e ninguém lhe chegava. Numa coluna
 * própria, quem escreve a estratégia vê o efeito do que escreveu enquanto o
 * escreve — que é a diferença entre um painel de diagnóstico e um painel de
 * trabalho.
 *
 * Mostra o resultado REAL de `montarContexto`, e não uma aproximação montada
 * aqui: uma segunda implementação divergiria da verdadeira e passaria a mentir
 * exatamente quando fosse preciso confiar nela.
 */
export function PainelContexto({
  montado,
  aRecarregar,
  aoRecarregar,
  aoFechar,
}: {
  montado: ContextoMontado;
  aRecarregar: boolean;
  aoRecarregar: () => void;
  aoFechar: () => void;
}) {
  const { estatisticas: e } = montado;
  const semPorque = e.totalReferencias - e.referenciasComPorque;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-borda px-3 py-2.5">
        <Eye className="size-4 shrink-0 text-texto-tenue" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-texto">
          O que a AI vê
        </h2>

        {aRecarregar && (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-texto-tenue"
            aria-label="A atualizar"
          />
        )}

        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          aria-label="Atualizar o contexto"
          onClick={aoRecarregar}
        >
          <RefreshCw />
        </Botao>
        <Botao
          variante="fantasma"
          tamanho="iconePequeno"
          aria-label="Fechar o painel"
          onClick={aoFechar}
        >
          <PanelRightClose />
        </Botao>
      </header>

      <div className="barra-fina min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-xs text-texto-tenue">
          O contexto exato que seria enviado. Nenhum modelo está ligado nesta
          fase — isto é o que ele receberia.
        </p>

        <dl className="mb-3 grid grid-cols-2 gap-1.5">
          <Numero rotulo="Publicações" valor={e.totalPublicados} />
          <Numero
            rotulo="Referências"
            valor={e.totalReferencias}
            nota={
              e.totalReferencias > 0
                ? `${e.referenciasComPorque} com porquê`
                : undefined
            }
            alerta={semPorque > 0}
          />
          <Numero rotulo="Aprendizagens" valor={e.totalAprendizagens} />
          <Numero
            rotulo="Tamanho"
            texto={`~${e.tokensEstimados.toLocaleString("pt-PT")}`}
            nota="tokens estimados"
          />
        </dl>

        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            Contexto montado
          </h3>
          <Botao
            variante="secundario"
            tamanho="pequeno"
            onClick={() => copiar(montado.texto)}
          >
            <Copy /> Copiar
          </Botao>
        </div>

        <pre className="barra-fina overflow-x-auto rounded-md border border-borda bg-superficie-2 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-texto-suave">
          {montado.texto}
        </pre>
      </div>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  texto,
  nota,
  alerta = false,
}: {
  rotulo: string;
  valor?: number;
  texto?: string;
  nota?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-md border border-borda bg-superficie-2 px-2.5 py-1.5">
      <dt className="text-[11px] text-texto-tenue">{rotulo}</dt>
      <dd
        className={cn(
          "text-sm font-medium",
          alerta ? "text-aviso" : "text-texto",
        )}
        data-numerico={valor !== undefined ? "" : undefined}
      >
        {valor !== undefined ? valor : texto}
      </dd>
      {nota && <dd className="text-[11px] text-texto-tenue">{nota}</dd>}
    </div>
  );
}

export async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar.feito("Copiado.");
  } catch {
    avisar.falhou(
      "O browser não deixou copiar.",
      "Seleciona o texto à mão e copia com Ctrl+C.",
    );
  }
}
