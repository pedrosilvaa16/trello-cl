import "server-only";

import { redirect } from "next/navigation";

import { criarClienteServidor, utilizadorAtual } from "./supabase/servidor";
import type { Perfil } from "./supabase/tipos";

/**
 * O perfil de quem está a usar a aplicação.
 *
 * Manda para a entrada se não houver sessão. O perfil nasce de um trigger em
 * auth.users, por isso existir sessão e não existir perfil só acontece se
 * alguém apagou a linha à mão — daí o recurso ao email como último nome.
 */
export async function exigirPerfil(): Promise<Perfil> {
  const utilizador = await utilizadorAtual();
  if (!utilizador) redirect("/entrar");

  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", utilizador.id)
    .maybeSingle();

  return (
    data ?? {
      id: utilizador.id,
      nome: utilizador.email?.split("@")[0] ?? "Colaborador",
      avatar_url: null,
      criado_em: new Date().toISOString(),
    }
  );
}
