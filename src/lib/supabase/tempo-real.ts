"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import type { ClienteNavegador } from "./navegador";

/**
 * Subscreve um canal **depois** de o socket saber quem está a falar.
 *
 * A ordem é a única coisa que este ficheiro faz, e é tudo o que interessa.
 *
 * O Realtime avalia as políticas de RLS por subscritor, e as credenciais que
 * usa para isso são as que o socket tinha NO MOMENTO EM QUE A SUBSCRIÇÃO FOI
 * CRIADA. Com o `createBrowserClient`, a sessão vem dos cookies e é resolvida
 * de forma assíncrona: quem chame `.subscribe()` no primeiro render subscreve
 * antes de o token lá chegar, e o Realtime fica a avaliar as políticas como se
 * fosse um visitante anónimo.
 *
 * O que isso dá não é um erro — é pior. O canal liga («SUBSCRIBED»), os eventos
 * chegam, e cada um deles vem com o registo VAZIO e um
 * `errors: ["Error 401: Unauthorized"]` que ninguém está a ler. A sincronização
 * parece montada e nunca sincronizou nada.
 *
 * `setAuth` antes de `subscribe` resolve. Foi encontrado a ver o separador das
 * tarefas no browser, mas o problema não era das tarefas: o mesmo acontecia — e
 * acontecia desde sempre — no quadro.
 *
 * Devolve a função de limpeza para o `useEffect`.
 */
export function subscreverAutenticado(
  supabase: ClienteNavegador,
  canal: RealtimeChannel,
): () => void {
  let vivo = true;

  void (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    // O efeito pode ter sido desmontado enquanto se esperava pela sessão.
    if (!vivo) return;

    await supabase.realtime.setAuth(session?.access_token);
    if (!vivo) return;

    canal.subscribe();
  })();

  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
}
