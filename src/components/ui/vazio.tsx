import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Estado vazio.
 *
 * Um ecrã vazio é um convite para agir, não um espaço em branco: diz o que
 * ainda não existe e dá o primeiro passo já feito.
 */
export function Vazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-borda-forte px-6 py-12 text-center",
        className,
      )}
    >
      <Icone className="size-7 text-texto-tenue" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-texto">{titulo}</p>
        <p className="mx-auto max-w-sm text-sm text-texto-suave">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}
