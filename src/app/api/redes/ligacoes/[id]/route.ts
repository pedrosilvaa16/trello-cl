import { quemPede, responderErro } from "@/lib/acessos";
import { sincronizarLigacao } from "@/lib/redes/sincronizar";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { LigacaoRede } from "@/lib/supabase/tipos";

/**
 * Desliga uma conta.
 *
 * `remover_ligacao_rede` exige `pode_gerir_quadro` e apaga o histórico com a
 * ligação: as métricas, a demografia, as publicações e o token vão todos
 * atrás, por `on delete cascade`. Não é reversível, e é por isso que a
 * interface confirma antes.
 */
export async function DELETE(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await quemPede();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();
    const { data, error } = await supabase.rpc("remover_ligacao_rede", {
      p_ligacao: id,
    });
    if (error) throw error;

    // Falso é "já não estava lá" — um duplo-clique, não um erro.
    return Response.json({ desligada: data === true });
  } catch (erro) {
    return responderErro(erro);
  }
}

/**
 * Força uma sincronização agora.
 *
 * Existe para dois momentos: quando o gestor acaba de renovar uma autorização e
 * quer confirmar que ficou boa, e quando alguém pergunta porque é que os
 * números de ontem ainda não apareceram. Fora disso, quem sincroniza é o cron.
 */
export async function POST(
  _pedido: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  try {
    await quemPede();
    const { id } = await contexto.params;

    const supabase = await criarClienteServidor();

    /*
      A leitura passa pelo RLS: quem não vê a ligação recebe `null` e leva um
      404, exatamente como um quadro de que não se é membro. A permissão de
      *escrever* é outra coisa, e vem a seguir.
    */
    const { data: ligacao } = await supabase
      .from("ligacoes_redes")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!ligacao) {
      return Response.json({ erro: "Ligação inexistente." }, { status: 404 });
    }

    const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
      board_id: (ligacao as LigacaoRede).board_id,
    });
    if (!podeGerir) {
      return Response.json(
        { erro: "Só quem gere o quadro pode forçar uma sincronização." },
        { status: 403 },
      );
    }

    return Response.json(await sincronizarLigacao(ligacao as LigacaoRede));
  } catch (erro) {
    return responderErro(erro);
  }
}
