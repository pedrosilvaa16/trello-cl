import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { chavePublicavel, chaveDeServico, urlSupabase } from "./ambiente";
import type { Database } from "./tipos";

/**
 * Cliente para Server Components, Server Actions e Route Handlers.
 *
 * Cria sempre uma instância nova por pedido — nunca guardar em módulo, senão a
 * sessão de um utilizador vaza para outro. As políticas de RLS continuam a
 * aplicar-se, porque o cliente usa o JWT do utilizador vindo dos cookies.
 */
export async function criarClienteServidor() {
  const armazemCookies = await cookies();

  return createServerClient<Database>(urlSupabase(), chavePublicavel(), {
    cookies: {
      getAll() {
        return armazemCookies.getAll();
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            armazemCookies.set(name, value, options);
          }
        } catch {
          // Durante o render de um Server Component não é possível gravar
          // cookies. É esperado: o refresh da sessão fica a cargo do proxy
          // (src/proxy.ts), que corre antes do render.
        }
      },
    },
  });
}

/**
 * Cliente com a chave de serviço. Ignora RLS por completo.
 *
 * Usar apenas onde é mesmo necessário passar por cima das políticas — resgate
 * de convites, tarefas administrativas. Nunca importar em código de cliente.
 */
export function criarClienteAdmin() {
  return createServerClient<Database>(urlSupabase(), chaveDeServico(), {
    auth: { persistSession: false, autoRefreshToken: false },
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Sem sessão para guardar: este cliente nunca representa um utilizador.
      },
    },
  });
}

/**
 * O utilizador autenticado do pedido, ou `null`.
 *
 * Usa sempre `getUser()` e nunca `getSession()`: só o primeiro valida o token
 * contra o servidor de autenticação. O segundo confia no cookie, que é
 * exatamente aquilo em que não se pode confiar do lado do servidor.
 */
export async function utilizadorAtual() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Como `utilizadorAtual`, mas manda para o ecrã de entrada se não houver sessão. */
export async function exigirUtilizador() {
  const utilizador = await utilizadorAtual();
  if (!utilizador) {
    redirect("/entrar");
  }
  return utilizador;
}
