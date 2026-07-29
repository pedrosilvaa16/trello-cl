import { z } from "zod";

import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";

const esquema = z.object({
  texto: z.string().trim().min(1).max(2000).optional(),
  tipo: z.enum(["funcionou", "nao_funcionou", "nota"]).optional(),
});

export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string; aid: string }> },
) {
  const { id, aid } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  /*
    O `eq("board_id", id)` não é redundante com o RLS: sem ele, o id de uma
    aprendizagem de OUTRO quadro que quem pede também gere passaria por aqui e
    seria alterada a partir do quadro errado. A política deixaria passar — é a
    mesma pessoa — mas o pedido estaria a mentir sobre onde estava.
  */
  const { data, error } = await sessao.supabase
    .from("aprendizagens")
    .update(validado.data)
    .eq("id", aid)
    .eq("board_id", id)
    .select()
    .maybeSingle();

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  if (!data) return inexistente();
  return Response.json(data);
}

export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string; aid: string }> },
) {
  const { id, aid } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const { error } = await sessao.supabase
    .from("aprendizagens")
    .delete()
    .eq("id", aid)
    .eq("board_id", id);

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  return Response.json({ removida: true });
}
