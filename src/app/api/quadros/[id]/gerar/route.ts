import { z } from "zod";

import { montarContexto, type TipoTarefa } from "@/lib/contexto";
import { exigirGestor, inexistente } from "@/lib/estrategia/acesso";
import { obterGerador } from "@/lib/gerador";

const esquema = z.object({
  tarefa: z.enum(["ideias", "legenda", "guiao", "voz_marca", "diagnostico"]),
  pedido: z.string().max(4000).optional(),
  cartao: z.string().uuid().nullable().optional(),
});

/**
 * Uma geração.
 *
 * NESTA FASE NÃO SAI NENHUM PEDIDO DESTA MÁQUINA. `obterGerador()` devolve o
 * simulado a não ser que `GERADOR=real`, e o real ainda rebenta de propósito.
 * O que aqui se exercita a sério é tudo o resto: montar o contexto verdadeiro,
 * gravar a geração com o retrato do que foi enviado, e a interface aguentar
 * uma resposta que demora.
 */
export async function POST(
  pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  if (!(await exigirGestor(id))) return inexistente();

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return Response.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const tarefa = validado.data.tarefa as TipoTarefa;
  const montado = await montarContexto(id, tarefa);

  try {
    const resultado = await obterGerador().gerar(
      montado,
      validado.data.pedido ?? "",
      { boardId: id, tarefa, cardId: validado.data.cartao ?? null },
    );
    return Response.json(resultado);
  } catch (erro) {
    // O gerador real rebenta de propósito enquanto não existir. A mensagem
    // dele é escrita para ser lida, e passa.
    return Response.json(
      {
        erro:
          erro instanceof Error ? erro.message : "Não foi possível gerar.",
      },
      { status: 501 },
    );
  }
}
