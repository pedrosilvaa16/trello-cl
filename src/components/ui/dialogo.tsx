"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Dialogo = RadixDialog.Root;
export const FecharDialogo = RadixDialog.Close;

function Fundo({ className }: { className?: string }) {
  return (
    <RadixDialog.Overlay
      className={cn(
        "fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className,
      )}
    />
  );
}

/** Caixa centrada. Para confirmações e formulários curtos. */
export function CaixaDialogo({
  titulo,
  descricao,
  children,
  className,
  larguraMaxima = "max-w-md",
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
  className?: string;
  larguraMaxima?: string;
}) {
  return (
    <RadixDialog.Portal>
      <Fundo />
      <RadixDialog.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          "rounded-lg border border-borda bg-superficie p-5 shadow-xl",
          "max-h-[calc(100vh-2rem)] overflow-y-auto barra-fina",
          "duration-[var(--duracao-arrasto)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          larguraMaxima,
          className,
        )}
      >
        <div className="mb-4 pr-8">
          <RadixDialog.Title className="text-base font-semibold text-texto">
            {titulo}
          </RadixDialog.Title>
          {descricao ? (
            <RadixDialog.Description className="mt-1 text-sm text-texto-suave">
              {descricao}
            </RadixDialog.Description>
          ) : (
            // O Radix exige uma descrição associada; escondida quando não há.
            <RadixDialog.Description className="sr-only">
              {titulo}
            </RadixDialog.Description>
          )}
        </div>

        <RadixDialog.Close
          className="absolute top-4 right-4 rounded-md p-1 text-texto-tenue transition-colors hover:bg-superficie-2 hover:text-texto"
          aria-label="Fechar"
        >
          <X className="size-4" />
        </RadixDialog.Close>

        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/**
 * Painel lateral. É onde vive o detalhe do cartão: mantém o quadro à vista,
 * e em ecrã pequeno ocupa tudo.
 */
export function PainelLateral({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Portal>
      <Fundo />
      <RadixDialog.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-borda bg-superficie shadow-2xl",
          "sm:max-w-xl",
          "duration-[var(--duracao-arrasto)] ease-[var(--curva)]",
          "data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
          className,
        )}
      >
        <RadixDialog.Title className="sr-only">{titulo}</RadixDialog.Title>
        <RadixDialog.Description className="sr-only">
          Detalhe do cartão
        </RadixDialog.Description>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

/** Rodapé de ações. A ação principal fica à direita, como manda o sistema. */
export function AcoesDialogo({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-5 flex justify-end gap-2", className)}>
      {children}
    </div>
  );
}
