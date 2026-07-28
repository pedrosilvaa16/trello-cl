"use client";

import * as React from "react";

import { Botao } from "@/components/ui/botao";
import { cn } from "@/lib/utils";

/**
 * Escrita rápida no sítio.
 *
 * Enter guarda e deixa o campo pronto para o próximo — escrever seis cartões
 * seguidos não obriga a voltar ao rato. Shift+Enter faz parágrafo, Escape
 * desiste. Sair do campo com texto por guardar guarda-o, em vez de o deitar
 * fora sem avisar.
 */
export function Compositor({
  valorInicial = "",
  placeholder,
  rotuloGuardar,
  aoGuardar,
  aoFechar,
  autoFoco = true,
  multiplasLinhas = true,
  continuar = false,
  className,
}: {
  valorInicial?: string;
  placeholder: string;
  rotuloGuardar: string;
  aoGuardar: (valor: string) => void | Promise<void>;
  aoFechar: () => void;
  autoFoco?: boolean;
  multiplasLinhas?: boolean;
  /** Fica aberto depois de guardar, para escrever o seguinte. */
  continuar?: boolean;
  className?: string;
}) {
  const [valor, definirValor] = React.useState(valorInicial);
  const [ocupado, definirOcupado] = React.useState(false);
  const campo = React.useRef<HTMLTextAreaElement>(null);
  const guardouAgora = React.useRef(false);

  React.useEffect(() => {
    if (!autoFoco) return;
    const elemento = campo.current;
    elemento?.focus();
    elemento?.setSelectionRange(elemento.value.length, elemento.value.length);
  }, [autoFoco]);

  // Cresce com o texto em vez de mostrar uma barra de rolamento minúscula.
  React.useEffect(() => {
    const elemento = campo.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [valor]);

  async function guardar() {
    const limpo = valor.trim();
    if (!limpo) {
      aoFechar();
      return;
    }

    definirOcupado(true);
    guardouAgora.current = true;
    try {
      await aoGuardar(limpo);
      if (continuar) {
        definirValor("");
        campo.current?.focus();
      } else {
        aoFechar();
      }
    } finally {
      definirOcupado(false);
      guardouAgora.current = false;
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <textarea
        ref={campo}
        value={valor}
        onChange={(evento) => definirValor(evento.target.value)}
        placeholder={placeholder}
        rows={multiplasLinhas ? 2 : 1}
        aria-label={placeholder}
        className="max-h-64 w-full resize-none overflow-y-auto rounded-cartao border border-borda-forte bg-superficie px-2 py-1.5 text-sm text-texto placeholder:text-texto-tenue"
        onKeyDown={(evento) => {
          if (evento.key === "Enter" && !evento.shiftKey) {
            evento.preventDefault();
            void guardar();
          }
          if (evento.key === "Escape") {
            evento.preventDefault();
            evento.stopPropagation();
            aoFechar();
          }
        }}
        onBlur={(evento) => {
          // Clicar no próprio botão de guardar não conta como desistir.
          if (evento.relatedTarget?.closest("[data-compositor]")) return;
          if (guardouAgora.current) return;
          if (valor.trim()) void guardar();
          else aoFechar();
        }}
      />

      <div className="flex items-center gap-2" data-compositor>
        <Botao
          variante="principal"
          tamanho="pequeno"
          onClick={guardar}
          ocupado={ocupado}
        >
          {rotuloGuardar}
        </Botao>
        <Botao variante="fantasma" tamanho="pequeno" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
