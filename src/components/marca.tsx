import Image from "next/image";

import { cn } from "@/lib/utils";

/*
  O logótipo é um ficheiro em public/, não um SVG embutido: são ~16 kB de
  curvas que o browser passa a servir de cache em vez de repetir no HTML de
  todas as páginas. A cor vive lá dentro (preto no claro, --cor-texto no
  escuro) — é a marca do cliente, não se pinta com as cores da interface.

  O `next/image` desliga a otimização sozinho quando o src acaba em .svg, por
  isso não é preciso mexer na configuração.
*/
const LARGURA_ORIGINAL = 360;
const ALTURA_ORIGINAL = 44;

/** Marca da casa. A altura vem do `className`; a largura acompanha. */
export function Marca({ className }: { className?: string }) {
  return (
    <Image
      src="/marca-creative-line.svg"
      alt="Creative Line."
      width={LARGURA_ORIGINAL}
      height={ALTURA_ORIGINAL}
      priority
      className={cn("h-[18px] w-auto", className)}
    />
  );
}
