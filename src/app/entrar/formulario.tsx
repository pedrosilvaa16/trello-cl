"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";

import { Botao } from "@/components/ui/botao";
import { Campo, Grupo } from "@/components/ui/campo";

import { entrar } from "./acoes";
import type { EstadoEntrada } from "./constantes";

export function FormularioEntrada({ destino }: { destino: string }) {
  const [estado, agir, pendente] = useActionState<EstadoEntrada, FormData>(
    entrar,
    {},
  );

  return (
    <form action={agir} className="space-y-4" noValidate>
      <input type="hidden" name="destino" value={destino} />

      <Grupo rotulo="Email">
        {(props) => (
          <Campo
            {...props}
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="nome@empresa.pt"
          />
        )}
      </Grupo>

      <Grupo rotulo="Palavra-passe">
        {(props) => (
          <Campo
            {...props}
            name="palavraPasse"
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </Grupo>

      {estado.erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-[var(--cor-perigo)] bg-[var(--cor-perigo-tenue)] px-3 py-2 text-sm text-perigo"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.erro}
        </p>
      )}

      <Botao
        type="submit"
        variante="principal"
        tamanho="grande"
        className="w-full"
        ocupado={pendente}
      >
        Entrar
      </Botao>
    </form>
  );
}
