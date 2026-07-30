import { porPosicao } from "../posicoes";
import type { EspacoTarefas, ListaTarefas, Tarefa } from "../supabase/tipos";

import type { DadosTarefas, TarefaCompleta } from "./tipos";

export type EstadoTarefas = {
  espacos: EspacoTarefas[];
  listas: ListaTarefas[];
  tarefas: TarefaCompleta[];
  equipa: DadosTarefas["equipa"];
};

export type AccaoTarefas =
  | { tipo: "espaco:upsert"; espaco: EspacoTarefas }
  | { tipo: "espaco:remover"; id: string }
  | { tipo: "lista:upsert"; lista: ListaTarefas }
  | { tipo: "lista:remover"; id: string }
  | { tipo: "tarefa:inserir"; tarefa: TarefaCompleta }
  /* `upsert` vem do Realtime e traz a linha crua, sem responsáveis nem
     contagens; `alterar` vem daqui e traz só os campos que mudaram. Os dois
     caminhos existem porque o canal não sabe o que já está no ecrã. */
  | { tipo: "tarefa:upsert"; tarefa: Tarefa }
  | { tipo: "tarefa:alterar"; id: string; campos: Partial<TarefaCompleta> }
  | { tipo: "tarefa:remover"; id: string }
  | {
      tipo: "tarefa:responsavel";
      tarefa: string;
      utilizador: string;
      ligar: boolean;
    };

/**
 * Uma linha que chegou de fora traz mesmo uma linha?
 *
 * O Realtime do Supabase, quando a verificação de RLS lhe corre mal, não corta
 * a ligação nem emite um erro: entrega o evento com o registo vazio — `{}` — e
 * um `errors: ["Error 401: Unauthorized"]` que ninguém está a ler. Sem esta
 * guarda, esse `{}` entrava no estado, ia parar ao `sort` e rebentava em
 * `porPosicao` ao comparar um `id` que não existe. O ecrã inteiro ficava em
 * branco por causa de uma mensagem que devia ter sido ignorada.
 *
 * A causa está corrigida na migração 20260730120000, mas a guarda fica: quem
 * escreve o reducer não manda no que o servidor lhe entrega, e nenhuma
 * mensagem vinda de fora pode derrubar a página.
 */
function temIdentidade<T extends { id?: unknown }>(linha: T | null | undefined) {
  return typeof linha?.id === "string" && linha.id.length > 0;
}

export function estadoInicial(dados: DadosTarefas): EstadoTarefas {
  /*
    Passa por `comContagens` como qualquer redução, e não é cerimónia: assim a
    invariante «as contagens batem certo com as tarefas que estão no estado»
    vale desde o primeiro render, sem depender de quem carregou os dados as ter
    somado bem. O servidor soma-as na mesma — é a mesma passagem barata — mas
    deixa de ser ele o único sítio onde isso pode correr mal.
  */
  return comContagens({
    espacos: dados.espacos,
    listas: dados.listas,
    tarefas: dados.tarefas,
    equipa: dados.equipa,
  });
}

/**
 * Reducer do separador «Tarefas».
 *
 * Três coisas escrevem aqui: as ações do utilizador (otimistas, antes da
 * rede), a resposta do servidor e o Realtime. A mesma alteração chega por isso
 * duas ou três vezes — todas as operações têm de ser idempotentes e fazer
 * merge em vez de substituir, ou fechar uma tarefa fá-la piscar quando o canal
 * devolve o que já estava no ecrã.
 */
export function reduzir(
  estado: EstadoTarefas,
  accao: AccaoTarefas,
): EstadoTarefas {
  switch (accao.tipo) {
    case "espaco:upsert": {
      if (!temIdentidade(accao.espaco)) return estado;
      const existe = estado.espacos.some((e) => e.id === accao.espaco.id);
      const espacos = existe
        ? estado.espacos.map((e) =>
            e.id === accao.espaco.id ? accao.espaco : e,
          )
        : [...estado.espacos, accao.espaco];
      return { ...estado, espacos: espacos.sort(porPosicao) };
    }

    case "espaco:remover": {
      // As listas e as tarefas vão atrás: no servidor é o ON DELETE CASCADE, e
      // o canal do Realtime não emite um evento por cada linha apagada em
      // cascata. Sem isto ficavam órfãs no ecrã até ao próximo recarregamento.
      const listasQueVao = new Set(
        estado.listas.filter((l) => l.espaco_id === accao.id).map((l) => l.id),
      );
      return {
        ...estado,
        espacos: estado.espacos.filter((e) => e.id !== accao.id),
        listas: estado.listas.filter((l) => l.espaco_id !== accao.id),
        tarefas: estado.tarefas.filter((t) => !listasQueVao.has(t.lista_id)),
      };
    }

    case "lista:upsert": {
      if (!temIdentidade(accao.lista)) return estado;
      const existe = estado.listas.some((l) => l.id === accao.lista.id);
      const listas = existe
        ? estado.listas.map((l) => (l.id === accao.lista.id ? accao.lista : l))
        : [...estado.listas, accao.lista];
      return { ...estado, listas: listas.sort(porPosicao) };
    }

    case "lista:remover":
      return {
        ...estado,
        listas: estado.listas.filter((l) => l.id !== accao.id),
        tarefas: estado.tarefas.filter((t) => t.lista_id !== accao.id),
      };

    case "tarefa:inserir": {
      if (!temIdentidade(accao.tarefa)) return estado;
      // Idempotente: a tarefa que acabou de ser criada aqui volta pelo canal.
      if (estado.tarefas.some((t) => t.id === accao.tarefa.id)) return estado;
      return {
        ...estado,
        tarefas: [...estado.tarefas, accao.tarefa].sort(porPosicao),
      };
    }

    case "tarefa:upsert": {
      if (!temIdentidade(accao.tarefa)) return estado;
      const atual = estado.tarefas.find((t) => t.id === accao.tarefa.id);
      if (!atual) {
        /*
          Chegou pelo canal uma tarefa que não estava no ecrã — criada por
          outra pessoa. Os responsáveis dela vêm noutro evento, da tabela de
          ligação, e as contagens são recalculadas mais abaixo.
        */
        return {
          ...estado,
          tarefas: [
            ...estado.tarefas,
            {
              ...accao.tarefa,
              responsaveis: [],
              nSubtarefas: 0,
              nSubtarefasFeitas: 0,
            },
          ].sort(porPosicao),
        };
      }
      /*
        Merge, e não substituição: a linha do canal não tem `responsaveis` nem
        as contagens, e substituir apagava-os do ecrã a cada alteração feita
        por outra pessoa.
      */
      return {
        ...estado,
        tarefas: estado.tarefas
          .map((t) => (t.id === accao.tarefa.id ? { ...t, ...accao.tarefa } : t))
          .sort(porPosicao),
      };
    }

    case "tarefa:alterar":
      return {
        ...estado,
        tarefas: estado.tarefas
          .map((t) => (t.id === accao.id ? { ...t, ...accao.campos } : t))
          .sort(porPosicao),
      };

    case "tarefa:remover":
      return {
        ...estado,
        // As subtarefas vão com a mãe — ON DELETE CASCADE do lado do servidor.
        tarefas: estado.tarefas.filter(
          (t) => t.id !== accao.id && t.mae_id !== accao.id,
        ),
      };

    case "tarefa:responsavel": {
      /*
        Devolve o MESMO estado quando não há nada a mudar.

        Atribuir uma tarefa manda a alteração otimista e, um instante depois, o
        canal devolve a mesma coisa — e sem esta saída antecipada o segundo
        evento produzia um objeto de estado novo, igual ao anterior, que o React
        não tem como distinguir do que já lá estava. Resultado: um redesenho e
        os `useMemo` todos a recalcular por causa de uma mensagem que não
        alterou coisa nenhuma.
      */
      let mudou = false;
      const tarefas = estado.tarefas.map((t) => {
        if (t.id !== accao.tarefa) return t;
        const tem = t.responsaveis.includes(accao.utilizador);
        if (accao.ligar === tem) return t; // já está como se pediu
        mudou = true;
        return {
          ...t,
          responsaveis: accao.ligar
            ? [...t.responsaveis, accao.utilizador]
            : t.responsaveis.filter((id) => id !== accao.utilizador),
        };
      });

      return mudou ? { ...estado, tarefas } : estado;
    }
  }
}

/**
 * Recalcula as contagens de subtarefas a partir da lista inteira.
 *
 * Corre depois de cada redução em vez de cada ramo tratar do assunto. É uma
 * passagem por todas as tarefas — barato para o volume disto — e é o que
 * garante que fechar uma subtarefa atualiza o «2 de 3» da mãe venha a
 * alteração de onde vier: do próprio ecrã, da resposta do servidor ou do canal
 * de outra pessoa. Espalhar esta soma por cinco ramos era garantir que um
 * deles se esquecia.
 */
export function comContagens(estado: EstadoTarefas): EstadoTarefas {
  const contagens = new Map<string, { total: number; feitas: number }>();
  for (const t of estado.tarefas) {
    if (!t.mae_id) continue;
    const atual = contagens.get(t.mae_id) ?? { total: 0, feitas: 0 };
    atual.total += 1;
    if (t.estado === "concluida") atual.feitas += 1;
    contagens.set(t.mae_id, atual);
  }

  let mudou = false;
  const tarefas = estado.tarefas.map((t) => {
    const contagem = contagens.get(t.id);
    const total = contagem?.total ?? 0;
    const feitas = contagem?.feitas ?? 0;
    if (t.nSubtarefas === total && t.nSubtarefasFeitas === feitas) return t;
    mudou = true;
    return { ...t, nSubtarefas: total, nSubtarefasFeitas: feitas };
  });

  // Sem alteração nenhuma devolve o mesmo objeto: o React compara por
  // referência, e um estado novo a cada tecla redesenhava a lista inteira.
  return mudou ? { ...estado, tarefas } : estado;
}

/** O reducer que a aplicação usa: reduzir e, logo a seguir, acertar as contagens. */
export function reduzirTarefas(
  estado: EstadoTarefas,
  accao: AccaoTarefas,
): EstadoTarefas {
  return comContagens(reduzir(estado, accao));
}
