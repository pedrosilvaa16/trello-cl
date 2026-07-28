import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const variantes = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
    "transition-colors duration-[var(--duracao-rapida)] ease-[var(--curva)] " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        principal:
          "bg-principal text-[var(--cor-principal-texto)] hover:bg-principal-forte",
        secundario:
          "bg-superficie text-texto border border-borda-forte hover:bg-superficie-2",
        fantasma: "text-texto-suave hover:bg-superficie-2 hover:text-texto",
        perigo: "bg-perigo text-white hover:opacity-90",
        ligacao:
          "text-principal underline-offset-4 hover:underline h-auto p-0 font-normal",
      },
      tamanho: {
        pequeno: "h-8 px-2.5 text-[13px] [&_svg]:size-4",
        normal: "h-9 px-3.5 text-sm [&_svg]:size-4",
        grande: "h-11 px-5 text-[15px] [&_svg]:size-5",
        icone: "size-8 [&_svg]:size-4",
        iconePequeno: "size-7 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variante: "secundario", tamanho: "normal" },
  },
);

type Props = React.ComponentProps<"button"> &
  VariantProps<typeof variantes> & {
    /** Renderiza no elemento filho — para <Link> com aspeto de botão. */
    comoFilho?: boolean;
    /** Mostra um indicador e bloqueia o botão. */
    ocupado?: boolean;
  };

export function Botao({
  className,
  variante,
  tamanho,
  comoFilho = false,
  ocupado = false,
  disabled,
  children,
  ...props
}: Props) {
  const Elemento = comoFilho ? Slot : "button";

  return (
    <Elemento
      className={cn(variantes({ variante, tamanho }), className)}
      disabled={disabled || ocupado}
      aria-busy={ocupado || undefined}
      {...props}
    >
      {ocupado ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Elemento>
  );
}

export { variantes as variantesBotao };
