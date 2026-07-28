import { quemPede, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Revoga um convite.
 *
 * O link deixa de funcionar no instante em que a linha desaparece — não há
 * nada em cache do lado de fora, porque o token só vale contra a tabela.
 *
 * Quem pode: quem o criou e quem gere os quadros a que ele dá acesso. É a
 * verificação que `revogar_convite` faz, e que também escreve no registo.
 */
export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await quemPede();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("revogar_convite", { p_convite: id });
    if (error) throw error;

    return Response.json({ revogado: true });
  } catch (erro) {
    return responderErro(erro);
  }
}
