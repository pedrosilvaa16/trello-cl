import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  apagarObjeto,
  chaveDaImagemDoQuadro,
  urlDeEscrita,
} from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/** 15 MB à entrada. O que sobe já vem reduzido pelo browser. */
const LIMITE_BYTES = 15 * 1024 * 1024;

const TIPOS_ACEITES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const pedidoDeEnvio = z.object({
  nomeFicheiro: z.string().trim().min(1).max(255),
  tipoMime: z.string().trim().refine((t) => TIPOS_ACEITES.includes(t), {
    message: "A imagem tem de ser JPEG, PNG, WebP ou AVIF.",
  }),
  tamanhoFundo: z.number().int().positive().max(LIMITE_BYTES),
  tamanhoMiniatura: z.number().int().positive().max(LIMITE_BYTES),
});

async function quemPede() {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/**
 * Autoriza o envio das duas imagens e devolve dois URLs de escrita.
 *
 * A mesma fotografia em dois tamanhos: o fundo do quadro e a miniatura da
 * lista. Vão do browser direto para o R2 — as credenciais nunca saem do
 * servidor, e as chaves são decididas aqui e não pelo cliente.
 *
 * A permissão perguntada é `pode_gerir_quadro`, a mesma que
 * `definir_imagem_quadro` volta a exigir a seguir. Aqui é só para dar um 403
 * antes de gastar o upload; quem manda é a função.
 */
export async function POST(
  pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  const { supabase, user } = await quemPede();
  if (!user) {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }

  const validado = pedidoDeEnvio.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json(
      { erro: validado.error.issues[0]?.message ?? "Pedido inválido." },
      { status: 400 },
    );
  }

  const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
    board_id: id,
  });

  if (!podeGerir) {
    return NextResponse.json(
      { erro: "Só quem gere o quadro pode mexer na imagem dele." },
      { status: 403 },
    );
  }

  const idImagem = randomUUID();
  const { nomeFicheiro, tipoMime } = validado.data;

  const fundo = chaveDaImagemDoQuadro(id, idImagem, "fundo", nomeFicheiro);
  const miniatura = chaveDaImagemDoQuadro(id, idImagem, "miniatura", nomeFicheiro);

  try {
    const [urlFundo, urlMiniatura] = await Promise.all([
      urlDeEscrita(fundo, tipoMime),
      urlDeEscrita(miniatura, tipoMime),
    ]);
    return NextResponse.json({
      fundo: { chave: fundo, url: urlFundo },
      miniatura: { chave: miniatura, url: urlMiniatura },
    });
  } catch {
    return NextResponse.json(
      { erro: "Não foi possível preparar o envio. Tenta outra vez." },
      { status: 502 },
    );
  }
}

const confirmacao = z.object({
  fundo: z.string().trim().min(1).max(500),
  miniatura: z.string().trim().min(1).max(500),
  brilho: z.enum(["claro", "escuro"]),
});

/** Confirma as imagens novas, depois de já estarem no R2. */
export async function PUT(
  pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;

  const validado = confirmacao.safeParse(await pedido.json().catch(() => null));
  if (!validado.success) {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }

  const { fundo, miniatura, brilho } = validado.data;
  return aplicar(id, fundo, miniatura, brilho);
}

/** Tira a imagem. Os objetos no R2 vão atrás. */
export async function DELETE(
  _pedido: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const { id } = await contexto.params;
  return aplicar(id, null, null, null);
}

async function aplicar(
  idQuadro: string,
  fundo: string | null,
  miniatura: string | null,
  brilho: "claro" | "escuro" | null,
) {
  const { supabase, user } = await quemPede();
  if (!user) {
    return NextResponse.json({ erro: "Sem sessão iniciada." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("definir_imagem_quadro", {
    p_quadro: idQuadro,
    p_fundo: fundo,
    p_miniatura: miniatura,
    p_brilho: brilho,
  });

  if (error) {
    const estado =
      error.code === "42501" ? 403 : error.code === "02000" ? 404 : 400;
    return NextResponse.json({ erro: error.message }, { status: estado });
  }

  /*
    A linha é a fonte de verdade e já está gravada. Falhar a apagar os objetos
    antigos não desfaz nada do que interessa — um ficheiro órfão no R2 não se
    vê em lado nenhum, e não vale devolver um erro por causa dele.
  */
  for (const antiga of [data?.fundo_anterior, data?.miniatura_anterior]) {
    if (antiga && antiga !== fundo && antiga !== miniatura) {
      try {
        await apagarObjeto(antiga);
      } catch {
        console.error("Imagem antiga do quadro ficou órfã no R2:", antiga);
      }
    }
  }

  return NextResponse.json(data);
}
