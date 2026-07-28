import { quemPede, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Tira alguém do quadro.
 *
 * Um gestor remove quem quiser; qualquer membro pode sair por sua iniciativa.
 * A regra do último gestor corre num trigger por baixo disto e devolve a
 * mensagem que a interface mostra — é melhor do que qualquer texto genérico
 * que se escrevesse aqui.
 */
export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string; uid: string }> },
) {
  try {
    await quemPede();
    const { id, uid } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("remover_membro_quadro", {
      p_quadro: id,
      p_utilizador: uid,
    });
    if (error) throw error;

    return Response.json({ removido: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
