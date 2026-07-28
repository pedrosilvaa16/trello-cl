import { cn } from "@/lib/utils";

/**
 * Marca da casa.
 *
 * Três colunas de alturas diferentes — um quadro visto de lado. Deliberadamente
 * sóbria: é uma ferramenta de trabalho, não uma campanha.
 */
export function Marca({
  className,
  comNome = true,
}: {
  className?: string;
  comNome?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        viewBox="0 0 24 24"
        className="size-5 shrink-0"
        aria-hidden
        fill="none"
      >
        <rect x="2" y="4" width="5.5" height="16" rx="1.5" fill="currentColor" />
        <rect
          x="9.25"
          y="4"
          width="5.5"
          height="11"
          rx="1.5"
          fill="currentColor"
          opacity="0.66"
        />
        <rect
          x="16.5"
          y="4"
          width="5.5"
          height="7"
          rx="1.5"
          fill="currentColor"
          opacity="0.38"
        />
      </svg>
      {comNome && (
        <span className="text-[15px] font-semibold tracking-tight">Quadros</span>
      )}
    </span>
  );
}
