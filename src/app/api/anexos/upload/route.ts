import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { LIMITE_BYTES, chaveDoAnexo, urlDeEscrita } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

const esquema = z.object({
  cartao: z.string().uuid(),
  nomeFicheiro: z.string().trim().min(1).max(255),
  tamanho: z.number().int().positive().max(LIMITE_BYTES),
  tipoMime: z.string().trim().min(1).max(160),
});

/**
 * Autoriza o envio de um anexo e devolve um URL de escrita para o R2.
 *
 * O ficheiro vai do browser direto para o R2, sem passar por aqui — é o que
 * permite anexos de 200 MB sem esbarrar no limite de corpo de pedido de uma
 * função serverless.
 *
 * Duas coisas são decididas no servidor e não se negoceiam: **se** pode enviar
 * (a permissão de escrita no quadro) e **para onde** (a chave do objeto). Se a
 * chave viesse do cliente, qualquer pessoa escrevia por cima do anexo de outra.
 */
export async function POST(pedido: NextRequest) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }

  const validado = esquema.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json(
      { erro: "Pedido inválido.", detalhe: validado.error.issues[0]?.message },
      { status: 400 },
    );
  }

  const { cartao, nomeFicheiro, tipoMime } = validado.data;

  /*
    A permissão é a do cartão, e não a do quadro: um freelancer com acesso a
    este cartão tem de poder entregar o trabalho nele, sem ter o quadro à volta.

    `pode_editar_cartao` é exatamente a função que a política de INSERT de
    `attachments` usa. Se aqui se perguntasse outra coisa — como se perguntava
    antes desta funcionalidade, pelo quadro — haveria duas regras a decidir o
    mesmo, e a mais frouxa das duas seria a que realmente valia.
  */
  const { data: quadro } = await supabase.rpc("quadro_do_cartao", {
    cartao,
  });

  if (!quadro) {
    return NextResponse.json({ erro: "Cartão não encontrado." }, { status: 404 });
  }

  const { data: podeEditar } = await supabase.rpc("pode_editar_cartao", {
    p_cartao: cartao,
  });

  if (!podeEditar) {
    return NextResponse.json(
      { erro: "Não tens permissão para anexar ficheiros neste cartão." },
      { status: 403 },
    );
  }

  // O id do anexo nasce aqui para a chave já o levar: assim o registo que o
  // cliente insere a seguir aponta para o objeto certo, sem segunda volta.
  const idAnexo = randomUUID();
  const chave = chaveDoAnexo(quadro, cartao, idAnexo, nomeFicheiro);

  try {
    const url = await urlDeEscrita(chave, tipoMime);
    return NextResponse.json({ id: idAnexo, chave, url });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar o envio. Tenta outra vez." },
      { status: 502 },
    );
  }
}
