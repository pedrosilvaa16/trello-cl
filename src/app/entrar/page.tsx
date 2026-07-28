import type { Metadata } from "next";

import { Marca } from "@/components/marca";

import { FormularioEntrada } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; motivo?: string }>;
}) {
  const { destino, motivo } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Marca className="mb-8 h-5" />

        <h1 className="text-xl font-semibold tracking-tight text-texto">
          Entrar
        </h1>
        <p className="mt-1 mb-6 text-sm text-texto-suave">
          A ferramenta de quadros da equipa.
        </p>

        {/*
          Um erro explica o que falhou e como resolver. "Palavra-passe errada"
          mandava esta pessoa tentar outra vez para sempre — o problema não é a
          palavra-passe dela.
        */}
        {motivo === "desativada" && (
          <div
            role="status"
            className="mb-6 rounded-md border border-borda-forte bg-superficie-2 p-3"
          >
            <p className="text-sm font-medium text-texto">
              Esta conta está desativada.
            </p>
            <p className="mt-0.5 text-xs text-texto-suave">
              O acesso foi retirado por quem gere a plataforma. Fala com essa
              pessoa para o recuperar — nada do teu trabalho foi apagado.
            </p>
          </div>
        )}

        <FormularioEntrada destino={destino ?? ""} />

        <p className="mt-8 border-t border-borda pt-4 text-xs leading-relaxed text-texto-tenue">
          O registo é fechado: as contas são criadas por convite. Se ainda não
          tens acesso, pede a quem gere a plataforma que te envie um convite.
        </p>
      </div>
    </main>
  );
}
