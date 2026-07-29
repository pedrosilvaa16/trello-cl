import { z } from "zod";

import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";

const esquema = z.object({
  porque: z.string().max(2000).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
});

/**
 * O porquê de uma referência, editado a partir da aba.
 *
 * Escreve por `definir_referencia_cartao` e não por UPDATE: as colunas estão
 * fora do GRANT de `cards`, porque um editor não tem nada que lhes mexer.
 */
export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  /*
    O cartão tem de ser deste quadro. Sem esta linha, o id de um cartão de
    outro quadro que quem pede também gere seria aceite aqui — a função em SQL
    verificaria a permissão desse outro quadro e deixaria passar, e a anotação
    ia parar ao sítio errado sem ninguém dar por isso.
  */
  const { data: cartao } = await sessao.supabase
    .from("cards")
    .select("id")
    .eq("id", cid)
    .eq("board_id", id)
    .maybeSingle();

  if (!cartao) return inexistente();

  const { data, error } = await sessao.supabase.rpc(
    "definir_referencia_cartao",
    {
      p_cartao: cid,
      p_porque: validado.data.porque ?? null,
      p_url: validado.data.url ?? null,
    },
  );

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  return Response.json(data);
}
