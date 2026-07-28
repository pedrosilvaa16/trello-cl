"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { criarClienteServidor } from "@/lib/supabase/servidor";

import type { EstadoEntrada } from "./constantes";

const esquema = z.object({
  email: z.string().trim().min(1, "Escreve o teu email.").email("Isto não parece um email."),
  palavraPasse: z.string().min(1, "Escreve a tua palavra-passe."),
});

/**
 * Entrar com email e palavra-passe.
 *
 * Não há registo público: quem não tem conta chega aqui por um link de convite.
 * Por isso o erro nunca sugere "criar conta" — sugere falar com um admin.
 */
export async function entrar(
  _anterior: EstadoEntrada,
  dados: FormData,
): Promise<EstadoEntrada> {
  const validado = esquema.safeParse({
    email: dados.get("email"),
    palavraPasse: dados.get("palavraPasse"),
  });

  if (!validado.success) {
    return { erro: validado.error.issues[0].message };
  }

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: validado.data.email,
    password: validado.data.palavraPasse,
  });

  if (error) {
    // A mensagem é a mesma para email errado e palavra-passe errada: dizer qual
    // dos dois falhou é dizer a um estranho que aquele email tem conta aqui.
    if (error.status === 400 || error.status === 401) {
      return {
        erro: "Email ou palavra-passe errados. Confirma os dados e tenta outra vez.",
      };
    }
    if (error.status === 429) {
      return {
        erro: "Demasiadas tentativas seguidas. Espera um minuto e tenta de novo.",
      };
    }
    return {
      erro: "Não foi possível entrar agora. Tenta daqui a pouco; se continuar, fala com um admin.",
    };
  }

  const destino = String(dados.get("destino") ?? "");
  // Só caminhos internos: um destino do género "//exemplo.com" mandava o
  // utilizador para fora logo a seguir a entrar.
  const seguro = destino.startsWith("/") && !destino.startsWith("//") ? destino : "/";

  redirect(seguro);
}

/** Terminar sessão. */
export async function sair() {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  redirect("/entrar");
}
