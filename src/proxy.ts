import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { chavePublicavel, urlSupabase } from "./lib/supabase/ambiente";

/**
 * Renova a sessão do Supabase antes de cada render.
 *
 * Server Components não conseguem gravar cookies, por isso é aqui que os tokens
 * refrescados são escritos na resposta. Sem este passo a sessão expira e o
 * utilizador é deslogado de forma aparentemente aleatória.
 */
export async function proxy(pedido: NextRequest) {
  let resposta = NextResponse.next({ request: { headers: pedido.headers } });

  const supabase = createServerClient(urlSupabase(), chavePublicavel(), {
    cookies: {
      getAll() {
        return pedido.cookies.getAll();
      },
      setAll(cookiesParaGravar) {
        // Primeiro no pedido, para que o render a seguir já veja os tokens novos.
        for (const { name, value } of cookiesParaGravar) {
          pedido.cookies.set(name, value);
        }
        resposta = NextResponse.next({ request: { headers: pedido.headers } });
        // Depois na resposta, para que o browser os guarde.
        for (const { name, value, options } of cookiesParaGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // Obriga a validar/refrescar o token. Não remover.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const caminho = pedido.nextUrl.pathname;
  const rotaAberta = ROTAS_ABERTAS.some(
    (rota) => caminho === rota || caminho.startsWith(`${rota}/`),
  );

  // Sem sessão, só as rotas abertas. Guardamos o destino para o devolver depois
  // de entrar — quem clica num link de um cartão quer ir parar ao cartão.
  if (!user && !rotaAberta) {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
    if (caminho !== "/") {
      destino.searchParams.set("destino", caminho + pedido.nextUrl.search);
    }
    return NextResponse.redirect(destino);
  }

  // Com sessão, o ecrã de entrada não tem nada para oferecer.
  if (user && caminho === "/entrar") {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

/**
 * O registo é fechado: só o ecrã de entrada e o resgate de convites vivem fora
 * da sessão. Tudo o resto é redirecionado para /entrar antes de renderizar.
 */
const ROTAS_ABERTAS = ["/entrar", "/convite"];

export const config = {
  matcher: [
    // Tudo excepto ficheiros estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
