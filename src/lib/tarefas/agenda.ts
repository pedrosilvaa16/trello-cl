import {
  addWeeks,
  endOfMonth,
  endOfWeek,
  isAfter,
  isSameDay,
  isWithinInterval,
  startOfDay,
} from "date-fns";

import type { TarefaCompleta } from "./tipos";
import { PRIORIDADES } from "./tipos";

/**
 * Os grupos da vista de agenda.
 *
 * A ordem desta lista é a ordem no ecrã, e é a ordem em que se decide: o que
 * já falhou primeiro, o resto por distância. `sem_data` fica no fim porque é
 * o balde do que ainda não foi decidido — não tem urgência nenhuma, e pô-lo
 * no meio empurrava para baixo coisas que a têm.
 */
export const BALDES = [
  "atrasado",
  "hoje",
  "esta_semana",
  "este_mes",
  "futuros",
  "sem_data",
] as const;

export type Balde = (typeof BALDES)[number];

export const NOMES_BALDE: Record<Balde, string> = {
  atrasado: "Atrasado",
  hoje: "Hoje",
  esta_semana: "Esta semana",
  este_mes: "Este mês",
  futuros: "Futuros",
  sem_data: "Sem data",
};

/** O que se lê quando o grupo está vazio. Nunca um espaço em branco. */
export const VAZIO_BALDE: Record<Balde, string> = {
  atrasado: "Nada em atraso.",
  hoje: "Nada para hoje.",
  esta_semana: "Nada para esta semana.",
  este_mes: "Nada para este mês.",
  futuros: "Nada marcado para lá deste mês.",
  sem_data: "Todas as tarefas têm data.",
};

/**
 * Em que grupo da agenda cai uma data-limite.
 *
 * COMPARA DIAS DE CALENDÁRIO, e não instantes. Uma tarefa marcada para hoje às
 * 09:00, vista às 15:00, fica em «Hoje» e não salta para «Atrasado» ao almoço.
 * O emblema ao lado dela — esse sim, pelo relógio — já diz que passou da hora;
 * a diferença entre as duas leituras é de propósito: o grupo responde a «que
 * dia é isto», o emblema responde a «ainda vou a tempo».
 *
 * A semana ganha ao mês quando as duas apanham a mesma data. Uma tarefa para
 * sábado, dia 2, vista numa quarta dia 30, é «Esta semana» — dizer-lhe «Este
 * mês» estaria certo pelo calendário e errado por tudo o resto.
 */
export function baldeDaData(dataLimite: string | null, agora: Date): Balde {
  if (!dataLimite) return "sem_data";

  const data = new Date(dataLimite);
  if (Number.isNaN(data.getTime())) return "sem_data";

  if (isSameDay(data, agora)) return "hoje";
  if (isAfter(startOfDay(agora), startOfDay(data))) return "atrasado";

  if (isWithinInterval(startOfDay(data), {
    start: startOfDay(agora),
    end: fimDaSemanaUtil(agora),
  })) {
    return "esta_semana";
  }

  if (isAfter(endOfMonth(agora), startOfDay(data))) return "este_mes";

  return "futuros";
}

/**
 * Até onde vai «Esta semana».
 *
 * Em Portugal a semana começa à segunda-feira, e por isso ao domingo o fim da
 * semana de calendário é hoje — o grupo ficaria sempre vazio e a tarefa de
 * amanhã cairia em «Este mês». Não é errado pelo calendário; é inútil
 * precisamente no dia em que alguém abre a agenda para planear a semana que
 * vem. Ao domingo, portanto, «esta semana» é a que está prestes a começar, que
 * é aliás o que a expressão quer dizer em voz alta nesse dia.
 */
function fimDaSemanaUtil(agora: Date): Date {
  const fim = endOfWeek(agora, { weekStartsOn: 1 });
  return isSameDay(fim, agora) ? addWeeks(fim, 1) : fim;
}

/**
 * Ordem dentro de um grupo: a data manda, a prioridade desempata.
 *
 * Duas tarefas para a mesma sexta-feira não têm nada que as separe a não ser
 * o que se decidiu sobre elas — e uma urgente por baixo de uma baixa, no mesmo
 * dia, é a lista a esconder precisamente aquilo que devia mostrar.
 *
 * Sem data nenhuma (o grupo `sem_data`) a ordem é a prioridade e depois a
 * posição, que é a ordem por que foram escritas.
 */
export function compararTarefas(a: TarefaCompleta, b: TarefaCompleta): number {
  if (a.data_limite && b.data_limite) {
    const diferenca =
      new Date(a.data_limite).getTime() - new Date(b.data_limite).getTime();
    if (diferenca !== 0) return diferenca;
  } else if (a.data_limite !== b.data_limite) {
    // Uma com data e outra sem, dentro do mesmo grupo, não devia acontecer —
    // mas se acontecer, a que tem data vem primeiro.
    return a.data_limite ? -1 : 1;
  }

  const prioridadeA = ordemPrioridade(a.prioridade);
  const prioridadeB = ordemPrioridade(b.prioridade);
  if (prioridadeA !== prioridadeB) return prioridadeA - prioridadeB;

  return a.posicao - b.posicao;
}

/** Sem prioridade vai para o fim — não é "baixa", é "ninguém decidiu". */
function ordemPrioridade(prioridade: TarefaCompleta["prioridade"]): number {
  if (!prioridade) return PRIORIDADES.length;
  return PRIORIDADES.indexOf(prioridade);
}

export type GrupoAgenda = {
  balde: Balde;
  nome: string;
  tarefas: TarefaCompleta[];
};

/**
 * Reparte as tarefas pelos grupos da agenda.
 *
 * Devolve SEMPRE os seis grupos, mesmo vazios. É deliberado: um grupo que
 * desaparece quando esvazia faz a lista saltar por baixo do cursor sempre que
 * se fecha a última tarefa de um dia, e tira a resposta à pergunta que se foi
 * lá fazer — «o que é que tenho para hoje?» merece um «nada» escrito, não uma
 * secção que não está lá.
 */
export function agruparPorAgenda(
  tarefas: TarefaCompleta[],
  agora: Date,
): GrupoAgenda[] {
  const grupos = new Map<Balde, TarefaCompleta[]>(
    BALDES.map((balde) => [balde, []]),
  );

  for (const tarefa of tarefas) {
    grupos.get(baldeDaData(tarefa.data_limite, agora))!.push(tarefa);
  }

  return BALDES.map((balde) => ({
    balde,
    nome: NOMES_BALDE[balde],
    tarefas: grupos.get(balde)!.sort(compararTarefas),
  }));
}
