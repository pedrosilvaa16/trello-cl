import { NextResponse, type NextRequest } from "next/server";

import { apagarObjeto, urlDeLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Lê a linha do anexo com a sessão do utilizador.
 *
 * A consulta *é* a verificação de permissão: se RLS não deixar ver a linha, não
 * há nada para assinar. É a mesma regra do quadro, sem a repetir aqui.
 */
async function anexoVisivel(id: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "sem-sessao" as const };

  const { data } = await supabase
    .from("attachments")
    .select("id, card_id, caminho_storage, nome_ficheiro, url")
    .eq("id", id)
    .maybeSingle();

  // Não existe ou não é visível para este utilizador — de fora é igual.
  if (!data) return { erro: "nao-encontrado" as const };
  return { anexo: data, utilizador: user };
}

/**
 * Acesso a um anexo.
 *
 * O bucket do R2 é privado e nada nele é servido diretamente. O caminho é
 * sempre o mesmo: confirmar a permissão do lado do servidor e só depois assinar
 * um URL de validade curta.
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

  // Anexo que é só uma ligação: não há objeto para assinar, e o cliente aponta
  // direto ao URL. Encaminhá-lo daqui fazia desta rota um redirecionador aberto
  // para qualquer endereço guardado na tabela.
  if (!anexo.caminho_storage) {
    return NextResponse.json(
      { erro: "Este anexo é uma ligação externa, não um ficheiro." },
      { status: 404 },
    );
  }

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
 * Remove um anexo.
 *
 * Apagar a linha vem primeiro, porque é ela que passa por RLS — quem não tem
 * permissão de escrita no quadro não apaga nada e o objeto no R2 nem chega a
 * ser tocado. As credenciais do R2 vivem só aqui, por isso isto não pode ser
 * feito do lado do cliente como era com o Supabase Storage.
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
    .from("attachments")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { erro: "Não foi possível remover o anexo." },
      { status: 500 },
    );
  }
  if (!count) {
    return NextResponse.json(
      { erro: "Não tens permissão para remover este anexo." },
      { status: 403 },
    );
  }

  if (resultado.anexo.caminho_storage) {
    try {
      await apagarObjeto(resultado.anexo.caminho_storage);
    } catch {
      // O registo é a fonte de verdade e já desapareceu. Um objeto órfão no R2
      // não se vê em lado nenhum e não vale falhar o pedido por causa dele.
    }
  }

  return NextResponse.json({ removido: true });
}
