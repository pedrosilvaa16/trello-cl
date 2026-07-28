import { z } from "zod";

import { exigirAdmin, exigirSuperAdmin, responderErro } from "@/lib/acessos";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** O detalhe de uma pessoa: quadros, cartões soltos, quem concedeu e quando. */
export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await exigirAdmin();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("detalhe_pessoa", { p_alvo: id });
    if (error) throw error;

    return Response.json(data);
  } catch (erro) {
    return responderErro(erro);
  }
}

const esquema = z.object({
  papelGlobal: z.enum(["super_admin", "admin", "externo"]),
});

/**
 * Altera o papel global — eixo A, exclusivo do super_admin.
 *
 * A verificação está em dois sítios de propósito, e não é redundância a mais:
 * `exigirSuperAdmin` dá o 403 legível, e `definir_papel_global` recusa na
 * mesma a quem lá chegue por outro caminho. Só a segunda é que é a permissão.
 */
export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await exigirSuperAdmin();
    const { id } = await contexto.params;

    const validado = esquema.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json(
        { erro: "Papel global inválido." },
        { status: 400 },
      );
    }

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("definir_papel_global", {
      p_alvo: id,
      p_papel: validado.data.papelGlobal,
    });
    if (error) throw error;

    return Response.json({ pessoa: data });
  } catch (erro) {
    return responderErro(erro);
  }
}
