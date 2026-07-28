"use client";

import * as RadixPopover from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Popover = RadixPopover.Root;
export const AbrirPopover = RadixPopover.Trigger;

export function ConteudoPopover({
  titulo,
  className,
  children,
  alinhamento = "start",
  ...props
}: React.ComponentProps<typeof RadixPopover.Content> & {
  titulo?: string;
  alinhamento?: "start" | "center" | "end";
}) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        align={alinhamento}
        sideOffset={6}
        className={cn(
          "z-50 w-72 rounded-md border border-borda bg-superficie p-2 shadow-lg",
          "duration-[var(--duracao-rapida)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {titulo && (
          <p className="mb-1.5 px-1 text-xs font-semibold tracking-wide text-texto-tenue uppercase">
            {titulo}
          </p>
        )}
        {children}
      </RadixPopover.Content>
    </RadixPopover.Portal>
  );
}
