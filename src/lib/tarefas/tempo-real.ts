"use client";

import * as React from "react";

import { criarClienteNavegador } from "../supabase/navegador";
import { subscreverAutenticado } from "../supabase/tempo-real";
import type { EspacoTarefas, ListaTarefas, Tarefa } from "../supabase/tipos";

import type { AccaoTarefas } from "./estado";

type LigacaoResponsavel = { tarefa_id: string; user_id: string };

/**
 * Liga o separador «Tarefas» ao Realtime.
 *
 * Duas pessoas a organizar a semana ao mesmo tempo é o caso normal deste
 * separador — não é o caso raro. Sem isto, uma fecha uma tarefa e a outra
 * continua a olhar para ela aberta até recarregar a página, e mais tarde ou
 * mais cedo fazem-na as duas.
 *
 * O Realtime reavalia RLS por subscritor, por isso o que chega a este canal é
 * sempre um subconjunto do que quem está a ver já podia ler. Não há filtro
 * nenhum a declarar: o separador é da casa inteiro, e quem não passa em
 * `pode_gerir_tarefas()` não recebe linha nenhuma.
 *
 * O prefixo `use` é contrato do React, e é por isso que este nome não está em
 * português como o resto — sem ele, as regras dos hooks deixam de ser
 * verificadas pelo linter.
 */
export function useTempoRealTarefas(
  despachar: React.Dispatch<AccaoTarefas>,
): void {
  React.useEffect(() => {
    const supabase = criarClienteNavegador();

    const canal = supabase
      .channel("tarefas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tarefas" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antiga = payload.old as Partial<Tarefa>;
            if (antiga.id) despachar({ tipo: "tarefa:remover", id: antiga.id });
            return;
          }

          const tarefa = payload.new as Tarefa;
          /*
            Arquivar é um UPDATE, e do lado de quem está a ver tem de se
            comportar como um desaparecimento: `carregarTarefas` já não traz as
            arquivadas, e deixá-la no ecrã só porque chegou por UPDATE punha as
            duas pessoas a ver listas diferentes.
          */
          if (tarefa.arquivada) {
            despachar({ tipo: "tarefa:remover", id: tarefa.id });
            return;
          }
          despachar({ tipo: "tarefa:upsert", tarefa });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tarefa_listas" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antiga = payload.old as Partial<ListaTarefas>;
            if (antiga.id) despachar({ tipo: "lista:remover", id: antiga.id });
            return;
          }

          const lista = payload.new as ListaTarefas;
          if (lista.arquivada) {
            despachar({ tipo: "lista:remover", id: lista.id });
            return;
          }
          despachar({ tipo: "lista:upsert", lista });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tarefa_espacos" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Partial<EspacoTarefas>;
            if (antigo.id) despachar({ tipo: "espaco:remover", id: antigo.id });
            return;
          }

          const espaco = payload.new as EspacoTarefas;
          if (espaco.arquivado) {
            despachar({ tipo: "espaco:remover", id: espaco.id });
            return;
          }
          despachar({ tipo: "espaco:upsert", espaco });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tarefa_responsaveis" },
        (payload) => {
          // Esta tabela não tem UPDATE — põe-se e tira-se. O `replica identity
          // full` é o que faz o DELETE chegar com as duas colunas.
          const linha = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as Partial<LigacaoResponsavel>;

          if (!linha.tarefa_id || !linha.user_id) return;

          despachar({
            tipo: "tarefa:responsavel",
            tarefa: linha.tarefa_id,
            utilizador: linha.user_id,
            ligar: payload.eventType !== "DELETE",
          });
        },
      );

    return subscreverAutenticado(supabase, canal);
  }, [despachar]);
}
