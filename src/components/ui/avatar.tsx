"use client";

import * as RadixAvatar from "@radix-ui/react-avatar";

import type { Perfil } from "@/lib/supabase/tipos";
import { cn, iniciais } from "@/lib/utils";

/**
 * Cor estável por pessoa: a mesma cara tem sempre a mesma cor, em qualquer
 * quadro e em qualquer sessão. Derivada do id, não do nome — um nome mudado
 * não faz o avatar saltar de cor.
 */
const PALETA = [
  "var(--etiqueta-verde)",
  "var(--etiqueta-azul)",
  "var(--etiqueta-roxo)",
  "var(--etiqueta-laranja)",
  "var(--etiqueta-rosa)",
  "var(--etiqueta-cinza)",
];

function corDe(id: string) {
  let soma = 0;
  for (let i = 0; i < id.length; i += 1) soma = (soma + id.charCodeAt(i)) % 997;
  return PALETA[soma % PALETA.length];
}

const tamanhos = {
  pequeno: "size-6 text-[10px]",
  normal: "size-8 text-xs",
  grande: "size-10 text-sm",
} as const;

export function Avatar({
  perfil,
  tamanho = "normal",
  className,
}: {
  perfil: Pick<Perfil, "id" | "nome" | "avatar_url">;
  tamanho?: keyof typeof tamanhos;
  className?: string;
}) {
  return (
    <RadixAvatar.Root
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "ring-1 ring-borda select-none",
        tamanhos[tamanho],
        className,
      )}
      title={perfil.nome}
    >
      {perfil.avatar_url && (
        <RadixAvatar.Image
          src={perfil.avatar_url}
          alt=""
          className="size-full object-cover"
        />
      )}
      <RadixAvatar.Fallback
        className="flex size-full items-center justify-center font-semibold text-white"
        style={{ backgroundColor: corDe(perfil.id) }}
        delayMs={perfil.avatar_url ? 300 : 0}
      >
        {iniciais(perfil.nome)}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}

/** Fila de avatares sobrepostos, com contagem quando não cabem todos. */
export function FilaAvatares({
  perfis,
  maximo = 4,
  tamanho = "pequeno",
}: {
  perfis: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  maximo?: number;
  tamanho?: keyof typeof tamanhos;
}) {
  if (perfis.length === 0) return null;
  const visiveis = perfis.slice(0, maximo);
  const restantes = perfis.length - visiveis.length;

  return (
    <div className="flex items-center -space-x-1.5">
      {visiveis.map((perfil) => (
        <Avatar
          key={perfil.id}
          perfil={perfil}
          tamanho={tamanho}
          className="ring-2 ring-[var(--cor-superficie)]"
        />
      ))}
      {restantes > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-superficie-3 font-semibold text-texto-suave ring-2 ring-[var(--cor-superficie)]",
            tamanhos[tamanho],
          )}
          title={perfis
            .slice(maximo)
            .map((p) => p.nome)
            .join(", ")}
        >
          +{restantes}
        </span>
      )}
    </div>
  );
}
