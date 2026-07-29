import { z } from "zod";

import { quemPede, responderErro } from "@/lib/acessos";
import { criarEstado } from "@/lib/redes/estado";
import { fornecedorDe, redirecionamentoDe } from "@/lib/redes/fornecedores";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  quadro: z.string().uuid(),
  rede: z.enum(["instagram", "facebook", "linkedin", "tiktok"]),
});

/**
 * Começa a autorização de uma rede social.
 *
 * Não liga nada: devolve o endereço para onde o browser tem de ir. Quem liga é
 * o callback, depois de a rede confirmar quem autorizou o quê.
 *
 * A permissão perguntada aqui é `pode_gerir_quadro`, e é perguntada outra vez
 * por `definir_ligacao_rede` lá ao fundo. Isto serve para dar um 403 antes de
 * mandar alguém a passear até à Meta e voltar para ouvir que não podia — quem
 * manda continua a ser a função.
 */
export async function POST(pedido: Request) {
  try {
    await quemPede();

    const validado = esquema.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json({ erro: "Pedido inválido." }, { status: 400 });
    }
    const { quadro, rede } = validado.data;

    const supabase = await criarClienteServidor();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
      board_id: quadro,
    });
    if (!podeGerir || !user) {
      return Response.json(
        { erro: "Só quem gere o quadro pode ligar contas de redes sociais." },
        { status: 403 },
      );
    }

    const fornecedor = fornecedorDe(rede);
    if (!fornecedor.configurado()) {
      return Response.json(
        {
          erro:
            `A ligação ao ${rede} ainda não está configurada neste servidor. ` +
            "Preenche as credenciais no ambiente e volta a tentar.",
        },
        { status: 503 },
      );
    }

    const estado = criarEstado({ quadro, rede, utilizador: user.id });

    return Response.json({
      url: fornecedor.urlAutorizacao(estado, redirecionamentoDe(rede)),
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
