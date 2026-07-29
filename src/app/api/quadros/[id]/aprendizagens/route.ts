import { z } from "zod";

import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";

const TIPOS = ["funcionou", "nao_funcionou", "nota"] as const;

const esquema = z.object({
  texto: z.string().trim().min(1).max(2000),
  tipo: z.enum(TIPOS),
});

/** As aprendizagens do quadro, da mais recente para a mais antiga. */
export async function GET(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const { data } = await sessao.supabase
    .from("aprendizagens")
    .select("*")
    .eq("board_id", id)
    .order("criado_em", { ascending: false });

  return Response.json(data ?? []);
}

export async function POST(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json(
      { erro: validado.error.issues[0]?.message ?? "Pedido inválido." },
      { status: 400 },
    );
  }

  const { data, error } = await sessao.supabase
    .from("aprendizagens")
    .insert({
      board_id: id,
      texto: validado.data.texto,
      tipo: validado.data.tipo,
      criado_por: sessao.user.id,
    })
    .select()
    .single();

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  return Response.json(data);
}
