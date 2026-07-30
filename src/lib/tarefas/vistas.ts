import type { TarefaCompleta } from "./tipos";

/**
 * O que está a ser visto.
 *
 * Três perguntas e um sítio. As perguntas atravessam todas as listas — é
 * precisamente isso que as torna úteis, e a razão por que a barra lateral as
 * põe por cima dos espaços.
 */
export type Vista =
  | { tipo: "agenda" }
  | { tipo: "minhas" }
  | { tipo: "criadas" }
  | { tipo: "lista"; id: string };

/** A chave que identifica a vista, para guardar no endereço e comparar. */
export function chaveDaVista(vista: Vista): string {
  return vista.tipo === "lista" ? `lista:${vista.id}` : vista.tipo;
}

/** O caminho inverso. Uma chave que não se entenda volta à agenda. */
export function vistaDaChave(chave: string | null | undefined): Vista {
  if (!chave) return { tipo: "agenda" };
  if (chave === "minhas" || chave === "criadas") return { tipo: chave };
  if (chave.startsWith("lista:")) {
    const id = chave.slice("lista:".length);
    if (id) return { tipo: "lista", id };
  }
  return { tipo: "agenda" };
}

export const TITULOS_VISTA: Record<Vista["tipo"], string> = {
  agenda: "Agenda",
  minhas: "Atribuídas a mim",
  criadas: "Criadas por mim",
  lista: "Lista",
};

/**
 * As tarefas de uma vista.
 *
 * `mostrarConcluidas` não é um filtro como os outros: por omissão está
 * desligado porque uma agenda cheia do que já se fez deixa de responder à
 * pergunta que se foi lá fazer. Ligá-lo serve para rever a semana, e é uma
 * segunda pergunta.
 *
 * Uma tarefa concluída que ainda tem subtarefas por fechar continua a
 * aparecer: escondê-la escondia com ela o trabalho que falta, e esse é o pior
 * resultado possível de um filtro.
 */
export function tarefasDaVista(
  tarefas: TarefaCompleta[],
  vista: Vista,
  opcoes: { eu: string; mostrarConcluidas: boolean },
): TarefaCompleta[] {
  return tarefas.filter((tarefa) => {
    if (!pertenceAVista(tarefa, vista, opcoes.eu)) return false;

    if (!opcoes.mostrarConcluidas && tarefa.estado === "concluida") {
      const temTrabalhoPorBaixo =
        tarefa.nSubtarefas > tarefa.nSubtarefasFeitas;
      if (!temTrabalhoPorBaixo) return false;
    }

    return true;
  });
}

function pertenceAVista(
  tarefa: TarefaCompleta,
  vista: Vista,
  eu: string,
): boolean {
  switch (vista.tipo) {
    case "agenda":
      return true;
    case "minhas":
      return tarefa.responsaveis.includes(eu);
    case "criadas":
      return tarefa.criado_por === eu;
    case "lista":
      return tarefa.lista_id === vista.id;
  }
}

/**
 * Quantas tarefas por fazer há em cada sítio.
 *
 * Conta o que está por fechar, e não o total. Um número ao lado de uma lista
 * responde a «quanto falta aqui»; o total responde a «quanto já cá passou»,
 * que não ajuda a decidir nada.
 */
export function contarPorVista(
  tarefas: TarefaCompleta[],
  eu: string,
): {
  agenda: number;
  minhas: number;
  criadas: number;
  porLista: Map<string, number>;
} {
  const porLista = new Map<string, number>();
  let agenda = 0;
  let minhas = 0;
  let criadas = 0;

  for (const tarefa of tarefas) {
    if (tarefa.estado === "concluida") continue;

    agenda += 1;
    if (tarefa.responsaveis.includes(eu)) minhas += 1;
    if (tarefa.criado_por === eu) criadas += 1;
    porLista.set(tarefa.lista_id, (porLista.get(tarefa.lista_id) ?? 0) + 1);
  }

  return { agenda, minhas, criadas, porLista };
}
