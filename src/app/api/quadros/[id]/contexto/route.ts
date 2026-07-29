import { z } from "zod";

import { montarContexto, type TipoTarefa } from "@/lib/contexto";
import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";

const TAREFAS: TipoTarefa[] = [
  "ideias",
  "legenda",
  "guiao",
  "voz_marca",
  "diagnostico",
];

/**
 * O contexto montado de um quadro — o que a AI veria.
 *
 * 404 para quem não gere o quadro. Ver `lib/estrategia/acesso.ts` para o
 * porquê de não ser 403.
 */
export async function GET(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  if (!(await exigirGestor(id))) return inexistente();

  const url = new URL(pedido.url);
  const pedida = url.searchParams.get("tarefa") as TipoTarefa | null;
  const tarefa = pedida && TAREFAS.includes(pedida) ? pedida : "ideias";

  return Response.json(await montarContexto(id, tarefa));
}

const esquema = z.object({
  estrategia: z.string().max(20000).nullable().optional(),
  vozMarca: z.string().max(20000).nullable().optional(),
});

/**
 * Guarda a estratégia e a voz da marca.
 *
 * Recebe as duas de cada vez, e não uma alteração parcial: é o que o editor da
 * aba tem em mãos, e um PATCH que só mandasse um dos campos apagaria o outro
 * ao passar por `guardar_contexto_quadro`, que escreve a linha inteira.
 */
export async function PATCH(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const sessao = await exigirGestor(id);
  if (!sessao) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { data, error } = await sessao.supabase.rpc("guardar_contexto_quadro", {
    p_quadro: id,
    p_estrategia: validado.data.estrategia ?? null,
    p_voz_marca: validado.data.vozMarca ?? null,
  });

  if (error) return Response.json({ erro: error.message }, { status: 400 });
  return Response.json(data);
}
