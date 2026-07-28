"use client";

import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Menu = RadixMenu.Root;
export const AbrirMenu = RadixMenu.Trigger;
export const SeparadorMenu = () => (
  <RadixMenu.Separator className="my-1 h-px bg-borda" />
);

export function ConteudoMenu({
  className,
  alinhamento = "end",
  children,
  ...props
}: React.ComponentProps<typeof RadixMenu.Content> & {
  alinhamento?: "start" | "center" | "end";
}) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        align={alinhamento}
        sideOffset={6}
        className={cn(
          "z-50 min-w-48 overflow-hidden rounded-md border border-borda bg-superficie p-1 shadow-lg",
          "duration-[var(--duracao-rapida)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className,
        )}
        {...props}
      >
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function ItemMenu({
  className,
  perigoso = false,
  ...props
}: React.ComponentProps<typeof RadixMenu.Item> & { perigoso?: boolean }) {
  return (
    <RadixMenu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none select-none",
        "data-[highlighted]:bg-superficie-2",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-texto-tenue",
        perigoso
          ? "text-perigo data-[highlighted]:bg-[var(--cor-perigo-tenue)] [&_svg]:text-perigo"
          : "text-texto",
        className,
      )}
      {...props}
    />
  );
}

export function RotuloMenu({
  className,
  ...props
}: React.ComponentProps<typeof RadixMenu.Label>) {
  return (
    <RadixMenu.Label
      className={cn(
        "px-2 py-1.5 text-xs font-semibold tracking-wide text-texto-tenue uppercase",
        className,
      )}
      {...props}
    />
  );
}

export function ItemMenuMarcavel({
  className,
  children,
  ...props
}: React.ComponentProps<typeof RadixMenu.CheckboxItem>) {
  return (
    <RadixMenu.CheckboxItem
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-texto outline-none select-none",
        "data-[highlighted]:bg-superficie-2",
        className,
      )}
      {...props}
    >
      {children}
    </RadixMenu.CheckboxItem>
  );
}
