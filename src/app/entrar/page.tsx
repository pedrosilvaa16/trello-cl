import type { Metadata } from "next";

import { Marca } from "@/components/marca";

import { FormularioEntrada } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Marca className="mb-8 text-principal" />

        <h1 className="text-xl font-semibold tracking-tight text-texto">
          Entrar
        </h1>
        <p className="mt-1 mb-6 text-sm text-texto-suave">
          A ferramenta de quadros da equipa.
        </p>

        <FormularioEntrada destino={destino ?? ""} />

        <p className="mt-8 border-t border-borda pt-4 text-xs leading-relaxed text-texto-tenue">
          O registo é fechado: as contas são criadas por convite. Se ainda não
          tens acesso, pede a um admin de um quadro que te envie um convite.
        </p>
      </div>
    </main>
  );
}
