import { exigirAdmin, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * A lista de pessoas.
 *
 * O âmbito não é decidido aqui: `listar_pessoas()` corre com a sessão de quem
 * pede e devolve todas as contas a um super_admin, e só quem partilha quadros
 * a um admin. Passar o âmbito num parâmetro seria pedir ao cliente que
 * dissesse quanto é que pode ver.
 */
export async function GET() {
  try {
    await exigirAdmin();

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("listar_pessoas");
    if (error) throw error;

    return Response.json({ pessoas: data ?? [] });
  } catch (erro) {
    return responderErro(erro);
  }
}
