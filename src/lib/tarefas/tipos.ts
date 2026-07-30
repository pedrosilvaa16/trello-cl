import type {
  EspacoTarefas,
  EstadoTarefa,
  ListaTarefas,
  Perfil,
  PrioridadeTarefa,
  Tarefa,
} from "@/lib/supabase/tipos";

/**
 * Uma tarefa com os responsáveis já resolvidos e as subtarefas contadas.
 *
 * Tudo isto vem na mesma consulta que as tarefas — a alternativa era uma
 * consulta por linha para saber quantas subtarefas tem, e a vista de agenda
 * mostra dezenas de linhas de uma vez.
 */
export type TarefaCompleta = Tarefa & {
  responsaveis: string[];
  /** Quantas subtarefas tem, e quantas já estão concluídas. */
  nSubtarefas: number;
  nSubtarefasFeitas: number;
};

/** Tudo o que o separador precisa para se desenhar. Carregado de uma vez. */
export type DadosTarefas = {
  espacos: EspacoTarefas[];
  listas: ListaTarefas[];
  tarefas: TarefaCompleta[];
  /** A equipa da casa: quem pode ser responsável por uma tarefa. */
  equipa: Pick<Perfil, "id" | "nome" | "avatar_url">[];
};

/* --------------------------------------------------------------- vocabulário */

/*
  Os rótulos vivem todos aqui, e não espalhados pelos componentes.

  Não é arrumação: é o que faz o emblema da lista, o menu de estado e o
  cabeçalho do grupo dizerem exatamente a mesma palavra. Três sítios a
  traduzir `em_curso` à sua maneira dão «Em curso», «A decorrer» e «Em
  progresso» no mesmo ecrã, e ninguém percebe que são a mesma coisa.
*/

export const ESTADOS: readonly EstadoTarefa[] = [
  "por_fazer",
  "em_curso",
  "bloqueada",
  "concluida",
] as const;

export const NOMES_ESTADO: Record<EstadoTarefa, string> = {
  por_fazer: "Por fazer",
  em_curso: "Em curso",
  bloqueada: "Bloqueada",
  concluida: "Concluída",
};

/**
 * A cor de cada estado, em variáveis da paleta da casa.
 *
 * `bloqueada` leva o vermelho de perigo e `em_curso` o verde da casa: o que
 * está parado tem de saltar à vista mais do que o que está a andar, que é
 * precisamente ao contrário do que a intuição sugere.
 */
export const CORES_ESTADO: Record<EstadoTarefa, string> = {
  por_fazer: "var(--cor-texto-tenue)",
  em_curso: "var(--cor-principal)",
  bloqueada: "var(--cor-perigo)",
  concluida: "var(--cor-sucesso)",
};

export const PRIORIDADES: readonly PrioridadeTarefa[] = [
  "urgente",
  "alta",
  "media",
  "baixa",
] as const;

export const NOMES_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

export const CORES_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  urgente: "var(--cor-perigo)",
  alta: "var(--cor-aviso)",
  media: "var(--cor-texto-suave)",
  baixa: "var(--cor-texto-tenue)",
};

/** Uma tarefa concluída deixa de pedir atenção, mesmo com a data passada. */
export function estaFeita(tarefa: Pick<Tarefa, "estado">) {
  return tarefa.estado === "concluida";
}
