import { quemPede, responderErro } from "@/lib/acessos";
import { emailConfigurado } from "@/lib/email";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Os convites que quem pede pode ver.
 *
 * Não pede papel global nenhum: um gestor de quadro convida para o quadro
 * dele, mesmo sendo externo, e por isso tem de poder ver o que convidou. O
 * âmbito é decidido dentro de `listar_convites()` — um super_admin vê tudo,
 * qualquer outra pessoa vê o que criou e o que toca em quadros que gere.
 */
export async function GET() {
  try {
    await quemPede();

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("listar_convites");
    if (error) throw error;

    return Response.json({
      convites: data ?? [],
      // A interface avisa quando não há como enviar, em vez de deixar quem
      // gere a carregar em "Reenviar" sem perceber porque não acontece nada.
      emailConfigurado: emailConfigurado(),
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
