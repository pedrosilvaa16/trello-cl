import { Check, Clock } from "lucide-react";

import { corEtiqueta } from "@/lib/cores";
import { type EstadoData, textoDataLimite } from "@/lib/datas";
import type { Etiqueta } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

/**
 * Etiqueta.
 *
 * Sem nome fica uma barra fina — no cartão, seis barras coloridas lêem-se de
 * relance sem roubar espaço ao título.
 */
export function EmblemaEtiqueta({
  etiqueta,
  compacta = false,
  className,
}: {
  etiqueta: Pick<Etiqueta, "nome" | "cor">;
  compacta?: boolean;
  className?: string;
}) {
  const cor = corEtiqueta(etiqueta.cor);

  if (compacta && !etiqueta.nome) {
    return (
      <span
        className={cn("h-2 w-8 rounded-full", className)}
        style={{ backgroundColor: cor }}
        title={etiqueta.nome || "Etiqueta sem nome"}
        aria-label={etiqueta.nome || "Etiqueta sem nome"}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium text-white",
        className,
      )}
      style={{ backgroundColor: cor }}
    >
      {etiqueta.nome || "Sem nome"}
    </span>
  );
}

const estilosData: Record<EstadoData, string> = {
  atrasado: "bg-[var(--cor-perigo-tenue)] text-perigo",
  hoje: "bg-[var(--cor-aviso-tenue)] text-aviso",
  amanha: "bg-superficie-3 text-texto-suave",
  futuro: "bg-superficie-3 text-texto-suave",
  concluido: "bg-[var(--cor-sucesso-tenue)] text-sucesso",
};

const prefixos: Record<EstadoData, string> = {
  atrasado: "Atrasado:",
  hoje: "Termina",
  amanha: "Termina",
  futuro: "Termina",
  concluido: "Concluído, era",
};

export function EmblemaData({
  dataLimite,
  estado,
  className,
}: {
  dataLimite: string;
  estado: EstadoData;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium",
        estilosData[estado],
        className,
      )}
    >
      {estado === "concluido" ? (
        <Check className="size-3" aria-hidden />
      ) : (
        <Clock className="size-3" aria-hidden />
      )}
      <span className="sr-only">{prefixos[estado]} </span>
      <time dateTime={dataLimite}>{textoDataLimite(dataLimite)}</time>
    </span>
  );
}

/** Emblema neutro, para contagens e papéis. */
export function Emblema({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-borda bg-superficie-2 px-1.5 py-0.5 text-[11px] font-medium text-texto-suave",
        className,
      )}
    >
      {children}
    </span>
  );
}
