import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { apagarObjeto, chaveDaCapa, urlDeEscrita, urlDeLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** 10 MB. Uma capa não é um anexo — é para ser vista, não guardada. */
const LIMITE_BYTES = 10 * 1024 * 1024;

const TIPOS_ACEITES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Lê o cartão com a sessão de quem pede.
 *
 * A consulta *é* a verificação de leitura: se o RLS não deixar ver a linha, não
 * há capa nenhuma para servir. A permissão de escrita é outra pergunta, e é
 * feita mais abaixo por `definir_imagem_cartao`.
 */
async function cartaoVisivel(id: string) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "sem-sessao" as const };

  const { data } = await supabase
    .from("cards")
    .select("id, board_id, imagem_destaque")
    .eq("id", id)
    .maybeSingle();

  // Não existe ou não é visível para este utilizador — de fora é igual.
  if (!data) return { erro: "nao-encontrado" as const };
  return { cartao: data, supabase };
}

function semSessao() {
  return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
}

function naoEncontrado() {
  return NextResponse.json({ erro: "Cartão não encontrado." }, { status: 404 });
}

/**
 * Serve a imagem de destaque.
 *
 * Encaminha para um URL assinado, como a rota dos anexos faz. O bucket é
 * privado e nada nele é servido diretamente: confirma-se a permissão e só
 * depois se assina, com validade curta.
 */
export async function GET(
  _pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const resultado = await cartaoVisivel(id);

  if (resultado.erro === "sem-sessao") return semSessao();
  if (resultado.erro) return naoEncontrado();

  const chave = resultado.cartao.imagem_destaque;
  if (!chave) {
    return NextResponse.json(
      { erro: "Este cartão não tem imagem de destaque." },
      { status: 404 },
    );
  }

  try {
    const url = await urlDeLeitura(chave);
    // O URL assinado é único por pedido: nunca pode ficar em cache partilhada.
    return NextResponse.redirect(url, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar a imagem. Tenta outra vez." },
      { status: 502 },
    );
  }
}

const pedidoDeEnvio = z.object({
  nomeFicheiro: z.string().trim().min(1).max(255),
  tamanho: z.number().int().positive().max(LIMITE_BYTES),
  tipoMime: z.string().trim().refine((t) => TIPOS_ACEITES.includes(t), {
    message: "A capa tem de ser uma imagem (JPEG, PNG, WebP ou AVIF).",
  }),
});

/**
 * Autoriza o envio de uma capa nova e devolve um URL de escrita para o R2.
 *
 * A imagem vai do browser direto para o R2, como os anexos. Duas coisas são
 * decididas aqui e não se negoceiam: **se** pode enviar e **para onde** — se a
 * chave viesse do cliente, escrevia-se por cima do que se quisesse no bucket.
 *
 * A permissão de escrita perguntada é `pode_gerir_quadro`, a mesma que
 * `definir_imagem_cartao` volta a exigir no passo seguinte. Aqui é só para dar
 * um 403 antes de o browser gastar o upload; quem manda é a função.
 */
export async function POST(
  pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const resultado = await cartaoVisivel(id);

  if (resultado.erro === "sem-sessao") return semSessao();
  if (resultado.erro) return naoEncontrado();

  const validado = pedidoDeEnvio.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json(
      { erro: validado.error.issues[0]?.message ?? "Pedido inválido." },
      { status: 400 },
    );
  }

  const { cartao, supabase } = resultado;

  const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
    board_id: cartao.board_id,
  });

  if (!podeGerir) {
    return NextResponse.json(
      { erro: "Só quem gere o quadro pode mexer na imagem de destaque." },
      { status: 403 },
    );
  }

  const chave = chaveDaCapa(
    cartao.board_id,
    cartao.id,
    randomUUID(),
    validado.data.nomeFicheiro,
  );

  try {
    const url = await urlDeEscrita(chave, validado.data.tipoMime);
    return NextResponse.json({ chave, url });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar o envio. Tenta outra vez." },
      { status: 502 },
    );
  }
}

const confirmacao = z.object({ chave: z.string().trim().min(1).max(500) });

/**
 * Confirma a capa nova, depois de o ficheiro já estar no R2.
 *
 * `definir_imagem_cartao` devolve a chave anterior, e é isso que permite
 * apagar o objeto antigo. Sem esse passo, cada substituição deixava um
 * ficheiro órfão no bucket que nada voltaria a apanhar.
 */
export async function PUT(
  pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;

  const validado = confirmacao.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  return aplicar(id, validado.data.chave);
}

/** Tira a capa. O objeto no R2 vai atrás — não fica nada a ocupar espaço. */
export async function DELETE(
  _pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  return aplicar(id, null);
}

async function aplicar(idCartao: string, chave: string | null) {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return semSessao();

  const { data, error } = await supabase.rpc("definir_imagem_cartao", {
    p_cartao: idCartao,
    p_chave: chave,
  });

  if (error) {
    const estado = error.code === "42501" ? 403 : error.code === "02000" ? 404 : 400;
    return NextResponse.json({ erro: error.message }, { status: estado });
  }

  /*
    A linha é a fonte de verdade e já está gravada. Falhar a apagar o objeto
    antigo não desfaz nada do que interessa — um ficheiro órfão no R2 não se vê
    em lado nenhum, e não vale a pena devolver um erro por causa dele.
  */
  const anterior = data?.anterior;
  if (anterior && anterior !== chave) {
    try {
      await apagarObjeto(anterior);
    } catch {
      console.error("Capa antiga ficou órfã no R2:", anterior);
    }
  }

  return NextResponse.json({ imagem_destaque: chave });
}
