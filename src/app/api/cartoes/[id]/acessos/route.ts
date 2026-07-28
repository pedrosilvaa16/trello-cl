import { z } from "zod";

import { quemPede, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  utilizador: z.string().uuid(),
  papel: z.enum(["gestor", "editor", "comentador", "leitor"]).default("editor"),
  /** Nulo = sem prazo. Com prazo, o acesso termina sozinho na data. */
  expiraEm: z.string().datetime().nullable().default(null),
});

/**
 * Dá a alguém acesso a um cartão sem lhe dar o quadro — o caso do freelancer.
 *
 * `expiraEm` é o que faz um trabalho pontual acabar sem ninguém se lembrar de
 * o revogar. Vale a pena preenchê-lo quase sempre.
 *
 * Quem pode conceder é quem gere o quadro do cartão, e isso é verificado em
 * `conceder_acesso_cartao` — que também recusa datas já passadas e contas
 * desativadas.
 */
export async function POST(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await quemPede();
    const { id } = await contexto.params;

    const validado = esquema.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json(
        { erro: "Pedido inválido.", detalhe: validado.error.issues[0]?.message },
        { status: 400 },
      );
    }

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("conceder_acesso_cartao", {
      p_cartao: id,
      p_utilizador: validado.data.utilizador,
      p_papel: validado.data.papel,
      p_expira_em: validado.data.expiraEm,
    });
    if (error) throw error;

    return Response.json({ acesso: data });
  } catch (erro) {
    return responderErro(erro);
  }
}
