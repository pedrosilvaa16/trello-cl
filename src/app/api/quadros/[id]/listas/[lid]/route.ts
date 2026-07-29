import { z } from "zod";

import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";

const esquema = z.object({
  tipo: z.enum(["normal", "referencias", "publicados"]),
});

/**
 * O tipo de uma lista — o que ela é na montagem de contexto.
 *
 * A migração adivinhou o tipo pelo nome, uma vez. Isto é o que permite
 * corrigir a adivinha, que é a única maneira de a heurística não virar uma
 * regra permanente enterrada no SQL.
 */
export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string; lid: string }> },
) {
  const { id, lid } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json({ erro: "Tipo de lista desconhecido." }, { status: 400 });
  }

  // A lista tem de ser deste quadro — ver a nota na rota das referências.
  const { data: lista } = await sessao.supabase
    .from("lists")
    .select("id")
    .eq("id", lid)
    .eq("board_id", id)
    .maybeSingle();

  if (!lista) return inexistente();

  const { data, error } = await sessao.supabase.rpc("definir_tipo_lista", {
    p_lista: lid,
    p_tipo: validado.data.tipo,
  });

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  return Response.json(data);
}
