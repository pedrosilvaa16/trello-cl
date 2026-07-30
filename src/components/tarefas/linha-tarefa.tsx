"use client";

import { CornerDownRight, ListChecks } from "lucide-react";

import { FilaAvatares } from "@/components/ui/avatar";
import { EmblemaData } from "@/components/ui/emblema";
import { corEtiqueta } from "@/lib/cores";
import { estadoData } from "@/lib/datas";
import type { EspacoTarefas, ListaTarefas, Perfil } from "@/lib/supabase/tipos";
import type { TarefaCompleta } from "@/lib/tarefas/tipos";
import { NOMES_ESTADO } from "@/lib/tarefas/tipos";
import { cn } from "@/lib/utils";

import { BandeiraPrioridade, PontoEstado } from "./seletores";

/**
 * Uma linha da lista de tarefas.
 *
 * Densa de propósito: título, onde vive, quem a leva, quando termina — tudo
 * numa altura de linha só. Numa ferramenta usada horas por dia, cada linha que
 * cresce é uma tarefa a menos visível sem rolar.
 *
 * O ponto do estado é um botão dentro da linha, e é isso que o `<div>` com
 * `onClick` por fora não podia ser: fechar uma tarefa é o gesto mais repetido
 * de todos e não pode obrigar a abrir o painel primeiro.
 */
export function LinhaTarefa({
  tarefa,
  lista,
  espaco,
  mae,
  equipa,
  ativa,
  mostrarLocal = true,
  aoAbrir,
  aoAlternarFeita,
}: {
  tarefa: TarefaCompleta;
  lista: ListaTarefas | undefined;
  espaco: EspacoTarefas | undefined;
  /** A tarefa mãe, quando esta é subtarefa. Dá-lhe o contexto que lhe falta. */
  mae: TarefaCompleta | undefined;
  equipa: Pick<Perfil, "id" | "nome" | "avatar_url">[];
  ativa: boolean;
  mostrarLocal?: boolean;
  aoAbrir: () => void;
  aoAlternarFeita: () => void;
}) {
  const feita = tarefa.estado === "concluida";
  const estado = estadoData(tarefa.data_limite, feita);
  const responsaveis = equipa.filter((p) => tarefa.responsaveis.includes(p.id));

  return (
    <div
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2 py-1.5",
        "transition-colors duration-[var(--duracao-rapida)]",
        ativa ? "bg-principal-tenue" : "hover:bg-superficie-2",
      )}
    >
      <button
        type="button"
        onClick={aoAlternarFeita}
        className="flex size-5 shrink-0 items-center justify-center rounded"
        aria-pressed={feita}
        aria-label={
          feita
            ? `Reabrir "${tarefa.titulo}"`
            : `Marcar "${tarefa.titulo}" como concluída`
        }
        title={NOMES_ESTADO[tarefa.estado]}
      >
        <PontoEstado estado={tarefa.estado} />
      </button>

      {/*
        Os avatares e o emblema da data ficam FORA deste botão, como irmãos na
        mesma linha. Não é arrumação: `<FilaAvatares>` desenha um `<div>`, e um
        `<div>` dentro de um `<button>` é HTML inválido — o browser fecha o
        botão sozinho ao interpretar, e o que sai da hidratação deixa de ser o
        que o servidor mandou.
      */}
      <button
        type="button"
        onClick={aoAbrir}
        className="min-w-0 flex-1 text-left"
        aria-current={ativa ? "true" : undefined}
      >
        <span className="block min-w-0">
          <span className="flex items-center gap-1.5">
            {tarefa.mae_id && (
              <CornerDownRight
                className="size-3.5 shrink-0 text-texto-tenue"
                aria-hidden
              />
            )}
            <span
              className={cn(
                "truncate text-sm text-texto",
                feita && "text-texto-tenue line-through",
              )}
            >
              {tarefa.titulo}
            </span>
            {tarefa.prioridade && (
              <BandeiraPrioridade prioridade={tarefa.prioridade} />
            )}
          </span>

          {/*
            A segunda linha só existe quando tem o que dizer. Um `<p>` vazio
            por baixo de cada título dava meia altura de linha desperdiçada
            vezes o número de tarefas no ecrã.
          */}
          {(mostrarLocal || mae || tarefa.nSubtarefas > 0) && (
            <span className="mt-0.5 flex items-center gap-2 text-xs text-texto-tenue">
              {mae ? (
                <span className="truncate">
                  <span className="sr-only">Subtarefa de </span>
                  {mae.titulo}
                </span>
              ) : (
                mostrarLocal &&
                lista && (
                  <span className="flex min-w-0 items-center gap-1.5">
                    {espaco && (
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: corEtiqueta(espaco.cor) }}
                        aria-hidden
                      />
                    )}
                    <span className="truncate">
                      {espaco ? `${espaco.nome} · ` : ""}
                      {lista.nome}
                    </span>
                  </span>
                )
              )}

              {tarefa.nSubtarefas > 0 && (
                <span
                  className="flex shrink-0 items-center gap-1"
                  title={`${tarefa.nSubtarefasFeitas} de ${tarefa.nSubtarefas} subtarefas concluídas`}
                >
                  <ListChecks className="size-3.5" aria-hidden />
                  <span data-numerico>
                    {tarefa.nSubtarefasFeitas}/{tarefa.nSubtarefas}
                  </span>
                </span>
              )}
            </span>
          )}
        </span>
      </button>

      {responsaveis.length > 0 && (
        <FilaAvatares perfis={responsaveis} maximo={3} />
      )}

      {estado && tarefa.data_limite && (
        <EmblemaData
          dataLimite={tarefa.data_limite}
          estado={estado}
          className="shrink-0"
        />
      )}
    </div>
  );
}
