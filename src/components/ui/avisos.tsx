"use client";

import { Toaster, toast } from "sonner";

/** Área de avisos. Montada uma vez, na raiz. */
export function Avisos() {
  return (
    <Toaster
      position="bottom-right"
      closeButton
      // Sem cores próprias do sonner: os avisos usam a paleta da casa.
      toastOptions={{
        classNames: {
          toast:
            "!bg-superficie !text-texto !border !border-borda !rounded-md !shadow-lg !font-sans",
          description: "!text-texto-suave",
          actionButton: "!bg-principal !text-[var(--cor-principal-texto)]",
          closeButton: "!bg-superficie !border-borda !text-texto-suave",
        },
      }}
    />
  );
}

/**
 * Avisos ao utilizador.
 *
 * Um erro diz o que falhou e como resolver — nunca "Ocorreu um erro".
 */
export const avisar = {
  feito(mensagem: string, detalhe?: string) {
    toast.success(mensagem, { description: detalhe });
  },
  falhou(mensagem: string, detalhe?: string) {
    toast.error(mensagem, { description: detalhe, duration: 6000 });
  },
  nota(mensagem: string, detalhe?: string) {
    toast(mensagem, { description: detalhe });
  },
  /** Para o que se desfaz: arquivar, remover. */
  comAnular(mensagem: string, anular: () => void) {
    toast(mensagem, {
      action: { label: "Anular", onClick: anular },
      duration: 8000,
    });
  },
};
