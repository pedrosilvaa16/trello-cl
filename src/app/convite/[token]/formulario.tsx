"use client";

import { AlertCircle } from "lucide-react";
import { useActionState } from "react";

import { Botao } from "@/components/ui/botao";
import { Campo, Grupo } from "@/components/ui/campo";

import { aceitarConvite } from "./acoes";
import { MINIMO_PALAVRA_PASSE, type EstadoConvite } from "./constantes";

export function FormularioConvite({ token }: { token: string }) {
  const [estado, agir, pendente] = useActionState<EstadoConvite, FormData>(
    aceitarConvite,
    {},
  );

  return (
    <form action={agir} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />

      <Grupo rotulo="O teu nome" ajuda="É o que aparece nos cartões e comentários.">
        {(props) => (
          <Campo
            {...props}
            name="nome"
            autoComplete="name"
            autoFocus
            required
            maxLength={80}
            placeholder="Ana Ferreira"
          />
        )}
      </Grupo>

      <Grupo
        rotulo="Palavra-passe"
        ajuda={`Pelo menos ${MINIMO_PALAVRA_PASSE} caracteres.`}
      >
        {(props) => (
          <Campo
            {...props}
            name="palavraPasse"
            type="password"
            autoComplete="new-password"
            required
            minLength={MINIMO_PALAVRA_PASSE}
          />
        )}
      </Grupo>

      <Grupo rotulo="Repete a palavra-passe">
        {(props) => (
          <Campo
            {...props}
            name="confirmacao"
            type="password"
            autoComplete="new-password"
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
        Criar conta e entrar
      </Botao>
    </form>
  );
}
