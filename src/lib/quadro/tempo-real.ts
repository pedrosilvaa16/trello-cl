"use client";

import * as React from "react";

import { criarClienteNavegador } from "../supabase/navegador";
import { subscreverAutenticado } from "../supabase/tempo-real";
import type { Cartao, Etiqueta, Lista } from "../supabase/tipos";
import type { AccaoQuadro } from "./estado";

type LigacaoCartaoEtiqueta = { card_id: string; label_id: string };
type LigacaoCartaoMembro = { card_id: string; user_id: string };

/**
 * Liga o quadro ao Realtime.
 *
 * O Realtime do Supabase reavalia RLS por subscritor, por isso o que chega a
 * este canal é sempre um subconjunto do que o utilizador já podia ler.
 *
 * Falta filtrar o quadro: `cards` não tem board_id, logo um cartão mexido
 * noutro quadro do mesmo utilizador também aparece aqui. Quem descarta esses é
 * o reducer, que é onde o estado atual está — assim este efeito não depende do
 * estado e subscreve o canal uma única vez, em vez de o refazer a cada tecla.
 *
 * O prefixo `use` não é anglicismo por distração: é o que faz as regras dos
 * hooks do React (e o compilador) reconhecerem isto como hook.
 */
export function useTempoReal(
  idQuadro: string,
  despachar: React.Dispatch<AccaoQuadro>,
) {
  React.useEffect(() => {
    const supabase = criarClienteNavegador();

    const canal = supabase
      .channel(`quadro:${idQuadro}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lists",
          filter: `board_id=eq.${idQuadro}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antiga = payload.old as Partial<Lista>;
            if (antiga.id) despachar({ tipo: "lista:remover", id: antiga.id });
            return;
          }
          despachar({ tipo: "lista:upsert", lista: payload.new as Lista });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antigo = payload.old as Partial<Cartao>;
            if (antigo.id) despachar({ tipo: "cartao:remover", id: antigo.id });
            return;
          }
          despachar({ tipo: "cartao:upsert", cartao: payload.new as Cartao });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "labels",
          filter: `board_id=eq.${idQuadro}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const antiga = payload.old as Partial<Etiqueta>;
            if (antiga.id) {
              despachar({ tipo: "etiqueta:remover", id: antiga.id });
            }
            return;
          }
          despachar({
            tipo: "etiqueta:upsert",
            etiqueta: payload.new as Etiqueta,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_labels" },
        (payload) => {
          const linha = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as LigacaoCartaoEtiqueta;
          despachar({
            tipo: "cartao:etiqueta",
            cartao: linha.card_id,
            etiqueta: linha.label_id,
            ligar: payload.eventType !== "DELETE",
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "card_members" },
        (payload) => {
          const linha = (
            payload.eventType === "DELETE" ? payload.old : payload.new
          ) as LigacaoCartaoMembro;
          despachar({
            tipo: "cartao:membro",
            cartao: linha.card_id,
            utilizador: linha.user_id,
            ligar: payload.eventType !== "DELETE",
          });
        },
      );

    /*
      `subscreverAutenticado` e não `.subscribe()` direto.

      A sessão do `createBrowserClient` vem dos cookies e resolve-se de forma
      assíncrona; subscrever no primeiro render subscrevia antes de o token
      chegar ao socket, e o Realtime passava a avaliar as políticas como se
      fosse um visitante anónimo. O canal ligava na mesma e os eventos chegavam
      na mesma — todos com o registo vazio e um 401 no `errors` que ninguém
      lia. O quadro parecia sincronizado e nunca sincronizou nada.
    */
    return subscreverAutenticado(supabase, canal);
  }, [idQuadro, despachar]);
}
