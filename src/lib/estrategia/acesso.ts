import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * A guarda do separador «Estratégia».
 *
 * 404 E NUNCA 403. Um 403 diz «isto existe e tu não podes» — que é
 * precisamente a informação que não se quer dar. Para um editor, um
 * comentador, um cliente ou um freelancer, estas rotas não existem, e a
 * resposta é a mesma que dariam se o quadro não existisse de todo.
 *
 * A verificação é `pode_gerir_quadro`, que já contempla o super_admin (gestor
 * de qualquer quadro) e já devolve falso para conta desativada. É a mesma
 * função que as políticas de RLS destas tabelas usam — não é uma segunda
 * regra, é a mesma consultada mais cedo para se poder dar uma resposta HTTP
 * decente em vez de deixar o Postgres recusar com uma mensagem que não é para
 * ler.
 */
export async function exigirGestor(idQuadro: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sem sessão também é 404: dizer «autentica-te primeiro» confirmaria que a
  // rota existe para alguém.
  if (!user) return null;

  const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
    board_id: idQuadro,
  });

  if (!podeGerir) return null;
  return { supabase, user };
}

/** A resposta para tudo o que não passa a guarda. Nada aqui é revelador. */
export function inexistente() {
  return Response.json({ erro: "Não encontrado." }, { status: 404 });
}
