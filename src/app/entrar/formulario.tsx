"use client";

import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useActionState, useId } from "react";

import { entrar } from "./acoes";
import type { EstadoEntrada } from "./constantes";

/*
  Campos com sublinhado e CTA azul quadrado — os mesmos do formulário do site.
  Não usa `ui/campo` nem `ui/botao` de propósito: esses trazem os cantos
  arredondados e o verde da ferramenta, que é precisamente o que esta página não
  deve mostrar a um cliente.
*/
export function FormularioEntrada({ destino }: { destino: string }) {
  const [estado, agir, pendente] = useActionState<EstadoEntrada, FormData>(
    entrar,
    {},
  );

  const idEmail = useId();
  const idPalavraPasse = useId();

  return (
    <form action={agir} noValidate>
      <input type="hidden" name="destino" value={destino} />

      <div className="campo">
        <label htmlFor={idEmail}>Email</label>
        <input
          id={idEmail}
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="nome@empresa.pt"
        />
      </div>

      <div className="campo">
        <label htmlFor={idPalavraPasse}>Palavra-passe</label>
        <input
          id={idPalavraPasse}
          name="palavraPasse"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      {estado.erro && (
        <p role="alert" className="erro">
          <AlertCircle strokeWidth={1.5} aria-hidden />
          {estado.erro}
        </p>
      )}

      <button type="submit" className="cta" disabled={pendente} aria-busy={pendente || undefined}>
        <span>{pendente ? "A entrar…" : "Entrar"}</span>
        <span className="icone" aria-hidden>
          {pendente ? (
            <Loader2 strokeWidth={1.5} className="a-girar" />
          ) : (
            <ArrowRight strokeWidth={1.5} />
          )}
        </span>
      </button>
    </form>
  );
}
