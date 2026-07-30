import { NextResponse, type NextRequest } from "next/server";

import { apagarObjeto, urlDeLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Lê a linha do anexo com a sessão de quem pede.
 *
 * A consulta *é* a verificação de permissão: `tarefa_anexos` tem RLS com
 * `pode_gerir_tarefas()`, e se ela não deixar ver a linha não há nada para
 * assinar. É a mesma regra do separador, sem uma segunda cópia aqui.
 */
async function anexoVisivel(id: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "sem-sessao" as const };

  const { data } = await supabase
    .from("tarefa_anexos")
    .select("id, tarefa_id, caminho_storage, nome_ficheiro")
    .eq("id", id)
    .maybeSingle();

  // Não existe ou não é visível para quem pede — de fora é indistinguível.
  if (!data) return { erro: "nao-encontrado" as const };
  return { anexo: data, utilizador: user };
}

/**
 * Descarregar um documento de uma tarefa.
 *
 * O bucket do R2 é privado e nada nele é servido diretamente. O caminho é
 * sempre o mesmo: confirmar a permissão no servidor e só depois assinar um URL
 * de validade curta.
 */
export async function GET(
  pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const resultado = await anexoVisivel(id);

  if (resultado.erro === "sem-sessao") {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }
  if (resultado.erro) {
    return NextResponse.json({ erro: "Anexo não encontrado." }, { status: 404 });
  }

  const { anexo } = resultado;
  const descarregar = pedido.nextUrl.searchParams.has("descarregar");

  try {
    const url = await urlDeLeitura(
      anexo.caminho_storage,
      descarregar ? anexo.nome_ficheiro : undefined,
    );
    // O URL assinado é único por pedido: nunca pode ficar em cache partilhada.
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar o ficheiro. Tenta outra vez." },
      { status: 502 },
    );
  }
}

/**
 * Remove um documento.
 *
 * Apagar a linha vem primeiro, porque é ela que passa por RLS — quem não tem
 * permissão não apaga nada e o objeto no R2 nem chega a ser tocado. As
 * credenciais do R2 vivem só no servidor, por isso isto não pode ser feito do
 * lado do cliente como o resto das escritas do separador.
 */
export async function DELETE(
  _pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const resultado = await anexoVisivel(id);

  if (resultado.erro === "sem-sessao") {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }
  if (resultado.erro) {
    return NextResponse.json({ erro: "Anexo não encontrado." }, { status: 404 });
  }

  const supabase = await criarClienteServidor();
  const { error, count } = await supabase
    .from("tarefa_anexos")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { erro: "Não foi possível remover o documento." },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json(
      { erro: "Não tens permissão para remover este documento." },
      { status: 403 },
    );
  }

  try {
    await apagarObjeto(resultado.anexo.caminho_storage);
  } catch {
    // O registo é a fonte de verdade e já desapareceu. Um objeto órfão no R2
    // não se vê em lado nenhum e não vale falhar o pedido por causa dele.
  }

  return NextResponse.json({ removido: true });
}
