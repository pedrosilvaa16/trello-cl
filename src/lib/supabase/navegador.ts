"use client";

import { createBrowserClient } from "@supabase/ssr";

import { chavePublicavel, urlSupabase } from "./ambiente";
import type { Database } from "./tipos";

/**
 * Cliente para Client Components. O `createBrowserClient` já é singleton, por
 * isso pode ser chamado à vontade — devolve sempre a mesma instância, o que
 * também garante uma única ligação de Realtime para os vários canais do quadro.
 */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(urlSupabase(), chavePublicavel());
}

export type ClienteNavegador = ReturnType<typeof criarClienteNavegador>;
