import "server-only";

import { redirect } from "next/navigation";

import { criarClienteServidor, utilizadorAtual } from "./supabase/servidor";
import type { PapelGlobal, Perfil } from "./supabase/tipos";

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

  if (!data) {
    return {
      id: utilizador.id,
      nome: utilizador.email?.split("@")[0] ?? "Colaborador",
      avatar_url: null,
      // O perfil que falta não tem papel nenhum a inventar: `externo` é o
      // default da coluna e é o mínimo, que é o que se deve assumir.
      papel_global: "externo",
      ativo: true,
      ultimo_acesso: null,
      criado_em: new Date().toISOString(),
    };
  }

  /*
    Uma conta desativada não fica com a sessão aberta a ver ecrãs vazios. O
    proxy já a manda embora antes do render; isto é a rede por baixo, para o
    caso de alguém chegar aqui por um caminho que o proxy não cobre.
  */
  if (!data.ativo) {
    redirect("/entrar?motivo=desativada");
  }

  /*
    Marca o último acesso. A função só escreve de cinco em cinco minutos, por
    isso na maioria dos renders isto é um UPDATE que não encontra linha.
    Falhar aqui não pode derrubar a página: é telemetria, não é o produto.
  */
  await Promise.resolve(supabase.rpc("registar_acesso")).catch(() => {});

  return data;
}

/**
 * O papel global de quem está a usar a aplicação.
 *
 * Serve para decidir o que a interface mostra. Não serve para decidir se uma
 * escrita acontece — isso é do servidor, sempre.
 */
export async function papelGlobalAtual(): Promise<PapelGlobal> {
  const perfil = await exigirPerfil();
  return perfil.papel_global;
}
