import * as RadixLabel from "@radix-ui/react-label";
import * as React from "react";

import { cn } from "@/lib/utils";

const base =
  "w-full rounded-md border border-borda-forte bg-superficie px-3 text-sm text-texto " +
  "placeholder:text-texto-tenue " +
  "transition-colors duration-[var(--duracao-rapida)] " +
  "hover:border-[var(--cor-texto-tenue)] " +
  "disabled:cursor-not-allowed disabled:opacity-60 " +
  "aria-[invalid=true]:border-perigo";

export function Campo({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(base, "h-9", className)} {...props} />;
}

export function Area({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(base, "min-h-20 resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Etiqueta({
  className,
  ...props
}: React.ComponentProps<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root
      className={cn(
        "text-[13px] font-medium text-texto-suave select-none",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Campo com rótulo, ajuda e erro já ligados por aria.
 * Um erro explica o que falhou; a ajuda explica o que se espera.
 */
export function Grupo({
  rotulo,
  ajuda,
  erro,
  children,
  className,
}: {
  rotulo: string;
  ajuda?: string;
  erro?: string;
  children: (props: {
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean | undefined;
  }) => React.ReactNode;
  className?: string;
}) {
  const id = React.useId();
  const idAjuda = `${id}-ajuda`;
  const idErro = `${id}-erro`;
  const descrito = [ajuda ? idAjuda : null, erro ? idErro : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cn("space-y-1.5", className)}>
      <Etiqueta htmlFor={id}>{rotulo}</Etiqueta>
      {children({
        id,
        "aria-describedby": descrito || undefined,
        "aria-invalid": erro ? true : undefined,
      })}
      {ajuda && !erro && (
        <p id={idAjuda} className="text-xs text-texto-tenue">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={idErro} className="text-xs font-medium text-perigo">
          {erro}
        </p>
      )}
    </div>
  );
}
