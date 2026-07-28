import { exigirAdmin, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Retira a esta pessoa todos os acessos que quem pede lhe consegue retirar.
 *
 * Um super_admin corta tudo; um admin corta o que está ao alcance dele — os
 * quadros que gere e os cartões lá dentro. O âmbito é decidido dentro de
 * `revogar_todos_os_acessos`, com a sessão de quem pede.
 *
 * Não desativa a conta. São duas decisões diferentes — "esta pessoa saiu da
 * empresa" e "este acesso foi dado por engano" — e é bom que continuem a ser
 * tomadas uma de cada vez.
 */
export async function POST(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await exigirAdmin();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("revogar_todos_os_acessos", {
      p_alvo: id,
    });
    if (error) throw error;

    return Response.json(data);
  } catch (erro) {
    return responderErro(erro);
  }
}
