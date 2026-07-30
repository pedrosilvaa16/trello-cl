import "server-only";

import { criarClienteServidor } from "@/lib/supabase/servidor";

import type { DadosTarefas, TarefaCompleta } from "./tipos";

/**
 * Tudo o que o separador «Tarefas» precisa, numa ida à base de dados.
 *
 * Quatro consultas em paralelo e a montagem feita aqui, como `carregarQuadro`
 * faz para o quadro. A alternativa — carregar por vista, à medida que se
 * navega — daria um pedido a cada clique na barra lateral para responder à
 * mesma pergunta com um filtro diferente. O trabalho interno de uma equipa de
 * três pessoas cabe na memória do browser com folga, e o que se ganha é a
 * troca de vista instantânea e a atualização otimista sem recarregar nada.
 *
 * Devolve `null` para quem não é da casa. Não é 403 nem lista vazia: é a mesma
 * regra da «Estratégia» — quem não entra não deve descobrir que isto existe.
 */
export async function carregarTarefas(): Promise<DadosTarefas | null> {
  const supabase = await criarClienteServidor();

  const { data: podeEntrar } = await supabase.rpc("pode_gerir_tarefas");
  if (!podeEntrar) return null;

  const [
    { data: espacos },
    { data: listas },
    { data: tarefas },
    { data: responsaveis },
    { data: equipa },
  ] = await Promise.all([
    supabase
      .from("tarefa_espacos")
      .select("*")
      .eq("arquivado", false)
      .order("posicao"),
    supabase
      .from("tarefa_listas")
      .select("*")
      .eq("arquivada", false)
      .order("posicao"),
    /*
      As arquivadas ficam de fora. Uma tarefa arquivada não é uma tarefa
      fechada — para isso há o estado `concluida`, que continua a aparecer —,
      é uma que se decidiu não fazer, e essas não têm nada que ocupar espaço na
      agenda de ninguém.
    */
    supabase
      .from("tarefas")
      .select("*")
      .eq("arquivada", false)
      .order("posicao"),
    supabase.from("tarefa_responsaveis").select("tarefa_id, user_id"),
    /*
      A equipa da casa: quem pode ser responsável por uma tarefa.

      Por uma função, e não por um `select` a `profiles`. A tabela tem RLS —
      `partilha_quadro` — e um `select` daqui devolveria só as colegas com quem
      se partilha um quadro: o menu de atribuir apareceria quase vazio, sem
      nada a dizer que faltava lá gente.

      `equipa_da_casa()` responde à mesma pergunta que `e_da_equipa()` faz na
      política de INSERT, e é isso que garante que a interface nunca oferece um
      nome que o servidor a seguir recusa.
    */
    supabase.rpc("equipa_da_casa"),
  ]);

  const porTarefa = new Map<string, string[]>();
  for (const linha of responsaveis ?? []) {
    const atual = porTarefa.get(linha.tarefa_id);
    if (atual) atual.push(linha.user_id);
    else porTarefa.set(linha.tarefa_id, [linha.user_id]);
  }

  /*
    Subtarefas contadas num passo só, e não com uma consulta por tarefa. As
    contagens são das subtarefas que sobreviveram ao filtro de arquivadas — o
    que está certo: «2 de 3» tem de bater com o que se vê ao abrir a tarefa.
  */
  const contagens = new Map<string, { total: number; feitas: number }>();
  for (const t of tarefas ?? []) {
    if (!t.mae_id) continue;
    const atual = contagens.get(t.mae_id) ?? { total: 0, feitas: 0 };
    atual.total += 1;
    if (t.estado === "concluida") atual.feitas += 1;
    contagens.set(t.mae_id, atual);
  }

  const completas: TarefaCompleta[] = (tarefas ?? []).map((t) => {
    const contagem = contagens.get(t.id);
    return {
      ...t,
      responsaveis: porTarefa.get(t.id) ?? [],
      nSubtarefas: contagem?.total ?? 0,
      nSubtarefasFeitas: contagem?.feitas ?? 0,
    };
  });

  return {
    espacos: espacos ?? [],
    listas: listas ?? [],
    tarefas: completas,
    equipa: equipa ?? [],
  };
}
