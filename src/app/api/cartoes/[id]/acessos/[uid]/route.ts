import { quemPede, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Revoga o acesso de alguém a um cartão.
 *
 * Quem gere o quadro revoga; e quem recebeu o acesso pode sempre abrir mão
 * dele — devolver um cartão que já não interessa não devia obrigar a pedir
 * favores a ninguém.
 */
export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string; uid: string }> },
) {
  try {
    await quemPede();
    const { id, uid } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("revogar_acesso_cartao", {
      p_cartao: id,
      p_utilizador: uid,
    });
    if (error) throw error;

    return Response.json({ revogado: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
