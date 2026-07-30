"use client";

import { CheckCircle2, ListTodo, Plus } from "lucide-react";
import * as React from "react";

import { Botao } from "@/components/ui/botao";
import { Campo } from "@/components/ui/campo";
import { Vazio } from "@/components/ui/vazio";
import type { EspacoTarefas, ListaTarefas, Perfil } from "@/lib/supabase/tipos";
import { agruparPorAgenda, compararTarefas, VAZIO_BALDE } from "@/lib/tarefas/agenda";
import type { TarefaCompleta } from "@/lib/tarefas/tipos";
import type { Vista } from "@/lib/tarefas/vistas";

import { LinhaTarefa } from "./linha-tarefa";

/**
 * A coluna do meio: as tarefas da vista escolhida.
 *
 * Na agenda vêm agrupadas por distância no tempo; nas outras vistas vêm numa
 * lista só, ordenada pela mesma regra. O agrupamento não é decoração: «o que é
 * que tenho para hoje» é a pergunta que se faz de manhã, e uma lista corrida
 * ordenada por data obriga a procurar onde é que hoje acaba.
 */
export function VistaTarefas({
  vista,
  tarefas,
  todas,
  listas,
  espacos,
  equipa,
  idAberta,
  agora,
  aoAbrir,
  aoAlternarFeita,
  aoCriar,
}: {
  vista: Vista;
  /** As tarefas já filtradas pela vista. */
  tarefas: TarefaCompleta[];
  /** Todas as tarefas — para encontrar a mãe de uma subtarefa que esteja filtrada. */
  todas: TarefaCompleta[];
  listas: ListaTarefas[];
  espacos: EspacoTarefas[];
  equipa: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  idAberta: string | null;
  /** O instante que decide os grupos. Vem de fora para o servidor e o cliente
      concordarem no primeiro render — ver `AreaTarefas`. */
  agora: Date;
  aoAbrir: (id: string) => void;
  aoAlternarFeita: (tarefa: TarefaCompleta) => void;
  /** Só existe numa vista de lista: nas outras não há onde pôr a tarefa nova. */
  aoCriar: ((titulo: string) => Promise<void>) | null;
}) {
  const porId = React.useMemo(
    () => new Map(todas.map((t) => [t.id, t])),
    [todas],
  );
  const listaPorId = React.useMemo(
    () => new Map(listas.map((l) => [l.id, l])),
    [listas],
  );
  const espacoPorId = React.useMemo(
    () => new Map(espacos.map((e) => [e.id, e])),
    [espacos],
  );

  function desenhar(tarefa: TarefaCompleta) {
    const lista = listaPorId.get(tarefa.lista_id);
    return (
      <li key={tarefa.id}>
        <LinhaTarefa
          tarefa={tarefa}
          lista={lista}
          espaco={lista ? espacoPorId.get(lista.espaco_id) : undefined}
          mae={tarefa.mae_id ? porId.get(tarefa.mae_id) : undefined}
          equipa={equipa}
          ativa={tarefa.id === idAberta}
          // Numa vista de lista, repetir o nome da lista em todas as linhas é
          // dizer o que o cabeçalho já disse.
          mostrarLocal={vista.tipo !== "lista"}
          aoAbrir={() => aoAbrir(tarefa.id)}
          aoAlternarFeita={() => aoAlternarFeita(tarefa)}
        />
      </li>
    );
  }

  if (tarefas.length === 0) {
    return (
      <div className="p-4">
        {aoCriar && <NovaTarefa aoCriar={aoCriar} />}
        <Vazio
          className="mt-4"
          icone={vista.tipo === "agenda" ? ListTodo : CheckCircle2}
          titulo={TITULO_VAZIO[vista.tipo]}
          descricao={DESCRICAO_VAZIO[vista.tipo]}
        />
      </div>
    );
  }

  if (vista.tipo !== "agenda") {
    return (
      <div className="space-y-2 p-4">
        {aoCriar && <NovaTarefa aoCriar={aoCriar} />}
        <ul className="space-y-0.5">
          {[...tarefas].sort(compararTarefas).map(desenhar)}
        </ul>
      </div>
    );
  }

  const grupos = agruparPorAgenda(tarefas, agora);

  return (
    <div className="space-y-5 p-4">
      {grupos.map((grupo) => (
        <section key={grupo.balde} aria-labelledby={`grupo-${grupo.balde}`}>
          <h2
            id={`grupo-${grupo.balde}`}
            className="mb-1.5 flex items-baseline gap-2 text-[13px] font-semibold text-texto"
          >
            {grupo.nome}
            {grupo.tarefas.length > 0 && (
              <span
                className="text-xs font-normal text-texto-tenue"
                data-numerico
              >
                {grupo.tarefas.length}
              </span>
            )}
          </h2>

          {grupo.tarefas.length === 0 ? (
            /*
              O grupo vazio fica, com uma frase em vez de nada. Um grupo que
              desaparece quando esvazia faz a lista saltar por baixo do cursor
              sempre que se fecha a última tarefa de um dia — e tira a resposta
              à pergunta que se foi lá fazer.
            */
            <p className="px-2 py-1.5 text-sm text-texto-tenue">
              {VAZIO_BALDE[grupo.balde]}
            </p>
          ) : (
            <ul className="space-y-0.5">{grupo.tarefas.map(desenhar)}</ul>
          )}
        </section>
      ))}
    </div>
  );
}

const TITULO_VAZIO: Record<Vista["tipo"], string> = {
  agenda: "Nada por fazer",
  minhas: "Nada atribuído a ti",
  criadas: "Ainda não criaste nenhuma tarefa",
  lista: "Esta lista está vazia",
};

const DESCRICAO_VAZIO: Record<Vista["tipo"], string> = {
  agenda:
    "Não há tarefas por fechar. Escolhe uma lista à esquerda para escrever a primeira.",
  minhas:
    "Quando alguém te atribuir uma tarefa — ou quando te atribuíres uma — ela aparece aqui.",
  criadas: "As tarefas que escreveres aparecem aqui, sejam de quem forem.",
  lista: "Escreve a primeira tarefa no campo acima.",
};

/**
 * Escrever uma tarefa nova.
 *
 * Um campo sempre visível no topo da lista, e não um botão que abre um
 * formulário: escrever uma tarefa é o gesto mais repetido do separador, e cada
 * clique a mais entre o pensamento e o texto é uma tarefa que não chega a ser
 * escrita. O resto — data, prioridade, responsável — põe-se depois, no painel.
 */
function NovaTarefa({ aoCriar }: { aoCriar: (titulo: string) => Promise<void> }) {
  const [titulo, definirTitulo] = React.useState("");
  const [ocupado, definirOcupado] = React.useState(false);

  async function criar() {
    const limpo = titulo.trim();
    if (!limpo || ocupado) return;
    definirOcupado(true);
    try {
      await aoCriar(limpo);
      definirTitulo("");
    } finally {
      definirOcupado(false);
    }
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(evento) => {
        evento.preventDefault();
        void criar();
      }}
    >
      <Campo
        value={titulo}
        onChange={(evento) => definirTitulo(evento.target.value)}
        placeholder="Escrever uma tarefa"
        aria-label="Título da tarefa nova"
        maxLength={200}
        disabled={ocupado}
      />
      <Botao
        type="submit"
        variante="principal"
        ocupado={ocupado}
        disabled={!titulo.trim()}
      >
        <Plus /> Criar
      </Botao>
    </form>
  );
}
