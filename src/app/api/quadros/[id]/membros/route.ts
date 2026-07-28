import { z } from "zod";

import { quemPede, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  utilizador: z.string().uuid(),
  papel: z.enum(["gestor", "editor", "comentador", "leitor"]),
});

/**
 * Acrescenta alguém ao quadro, ou muda-lhe o papel.
 *
 * Não pede papel global nenhum: gerir membros é do eixo B, e quem gere o
 * quadro gere-o mesmo sendo externo. Quem decide é `definir_membro_quadro`,
 * que exige `pode_gerir_quadro` com a sessão de quem pede.
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
    const { data, error } = await supabase.rpc("definir_membro_quadro", {
      p_quadro: id,
      p_utilizador: validado.data.utilizador,
      p_papel: validado.data.papel,
    });
    if (error) throw error;

    return Response.json({ membro: data });
  } catch (erro) {
    return responderErro(erro);
  }
}
