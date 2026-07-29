"use client";

import { Check, Loader2 } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { cn } from "@/lib/utils";

/**
 * Um editor de documento que se guarda sozinho.
 *
 * Guardar com um botão obrigava a lembrar de carregar nele, e o custo de
 * esquecer é perder um documento de estratégia escrito de uma assentada. O
 * atraso de 1,2 s é o que evita gravar a cada tecla sem chegar a parecer que
 * nada foi guardado.
 *
 * O estado é mostrado por extenso — «a guardar», «guardado às 14:32» — porque
 * um editor que grava sozinho e não diz nada é indistinguível de um que não
 * grava nada.
 */
export function EditorDocumento({
  id,
  rotulo,
  descricao,
  sugestao,
  valorInicial,
  minhas,
  linhas = 12,
  aoGuardar,
  extra,
}: {
  id: string;
  rotulo: string;
  descricao: string;
  /** O que aparece no campo vazio, a sugerir a estrutura. */
  sugestao: string;
  valorInicial: string;
  /** Quem guardou da última vez e quando, já formatado. */
  minhas: string | null;
  /** Altura do campo. Um documento de estratégia quer espaço para se ver. */
  linhas?: number;
  aoGuardar: (valor: string) => Promise<void>;
  extra?: React.ReactNode;
}) {
  const [valor, definirValor] = React.useState(valorInicial);
  const [estado, definirEstado] = React.useState<
    "parado" | "a-guardar" | "guardado"
  >("parado");
  const [guardadoAs, definirGuardadoAs] = React.useState<string | null>(null);

  // O valor gravado da última vez. Serve para não gravar o que não mudou —
  // nem à entrada, nem quando o servidor devolve o que já lá estava.
  const gravado = React.useRef(valorInicial);

  /*
    `aoGuardar` é uma função nova a cada render do pai. Guardá-la numa ref
    dentro de um efeito — e não durante o render — é o que impede o temporizador
    de ser reiniciado a cada tecla, sem quebrar a regra de não tocar em refs
    enquanto se desenha.
  */
  const guardar = React.useRef(aoGuardar);
  React.useEffect(() => {
    guardar.current = aoGuardar;
  }, [aoGuardar]);

  React.useEffect(() => {
    if (valor === gravado.current) return;

    const temporizador = setTimeout(async () => {
      definirEstado("a-guardar");
      try {
        await guardar.current(valor);
        gravado.current = valor;
        definirGuardadoAs(
          new Date().toLocaleTimeString("pt-PT", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        );
        definirEstado("guardado");
      } catch (erro) {
        definirEstado("parado");
        avisar.falhou(
          erro instanceof Error ? erro.message : "Não foi possível guardar.",
          "O que escreveste continua aqui. Tenta outra vez daqui a pouco.",
        );
      }
    }, 1200);

    return () => clearTimeout(temporizador);
  }, [valor]);

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-texto">{rotulo}</h2>
        <p
          className="flex items-center gap-1.5 text-xs text-texto-tenue"
          aria-live="polite"
        >
          {estado === "a-guardar" && (
            <>
              <Loader2 className="size-3 animate-spin" aria-hidden /> A guardar…
            </>
          )}
          {estado === "guardado" && guardadoAs && (
            <>
              <Check className="size-3 text-sucesso" aria-hidden /> Guardado às{" "}
              {guardadoAs}
            </>
          )}
          {estado === "parado" && minhas}
        </p>
      </div>

      <p className="mb-3 text-xs text-texto-suave">{descricao}</p>

      {extra}

      <textarea
        id={id}
        value={valor}
        onChange={(evento) => definirValor(evento.target.value)}
        placeholder={sugestao}
        rows={linhas}
        className={cn(
          "w-full resize-y rounded-md border border-borda-forte bg-superficie px-3 py-2",
          "font-mono text-[13px] leading-relaxed text-texto",
          "placeholder:text-texto-tenue focus-visible:border-principal focus-visible:outline-none",
        )}
      />
    </section>
  );
}
