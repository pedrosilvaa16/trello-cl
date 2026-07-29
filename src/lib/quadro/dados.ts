import "server-only";

import { cache } from "react";

import { urlDeLeitura } from "@/lib/r2";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Cartao, PapelQuadro, Quadro } from "@/lib/supabase/tipos";

import { porPosicao } from "../posicoes";
import type { CartaoCompleto, DadosQuadro, MembroComPerfil } from "./tipos";

/**
 * O nome e o papel, e mais nada.
 *
 * Serve o `layout.tsx` do quadro, os `generateMetadata` e a página de
 * estatísticas — três sítios que precisam de saber de que quadro se trata sem
 * precisarem de um único cartão.
 *
 * O `cache()` do React não é um pormenor: sem ele, cada render do quadro fazia
 * esta consulta três vezes, uma por cada um desses sítios. Com ele, é uma por
 * pedido e as outras duas leem o resultado.
 */
export const carregarCabecalhoQuadro = cache(async function carregarCabecalhoQuadro(
  idQuadro: string,
): Promise<{ quadro: Quadro; papel: PapelQuadro } | null> {
  const supabase = await criarClienteServidor();

  const [{ data: quadro }, { data: papel }] = await Promise.all([
    supabase.from("boards").select("*").eq("id", idQuadro).maybeSingle(),
    supabase.rpc("papel_no_quadro", { board_id: idQuadro }),
  ]);

  // Nulo tanto para o quadro que não existe como para o que não é nosso — do
  // lado de cá são indistinguíveis, e é assim que deve ser.
  if (!quadro || !papel) return null;
  return { quadro, papel: papel as PapelQuadro };
});

/**
 * Assina as imagens de destaque de um conjunto de quadros.
 *
 * Assinar é uma operação local (um HMAC), não uma ida à rede — 19 quadros
 * custam microssegundos. Fazê-lo aqui, no render, evita que cada cartão da
 * lista tenha de bater numa rota só para ser reencaminhado para o R2.
 *
 * A permissão não precisa de nova verificação: estes quadros já saíram de uma
 * consulta filtrada por RLS, portanto só se assina o que o utilizador podia ver.
 */
async function comImagens<T extends Pick<Quadro, "imagem_fundo" | "imagem_miniatura">>(
  quadros: T[],
  qual: "imagem_fundo" | "imagem_miniatura",
): Promise<(T & { imagem: string | null })[]> {
  return Promise.all(
    quadros.map(async (quadro) => {
      const chave = quadro[qual];
      if (!chave) return { ...quadro, imagem: null };
      try {
        return { ...quadro, imagem: await urlDeLeitura(chave) };
      } catch {
        // Sem imagem o quadro desenha-se na mesma, com a cor. Falhar a página
        // inteira por causa de uma fotografia seria desproporcionado.
        return { ...quadro, imagem: null };
      }
    }),
  );
}

/**
 * Carrega um quadro inteiro.
 *
 * Devolve `null` quando o quadro não existe **ou** quando o utilizador não é
 * membro dele — do lado de cá os dois casos são indistinguíveis, e é assim que
 * deve ser: RLS faz o quadro alheio desaparecer, não dá erro de permissão.
 */
export async function carregarQuadro(
  idQuadro: string,
): Promise<DadosQuadro | null> {
  const supabase = await criarClienteServidor();

  const [{ data: quadro }, { data: papel }] = await Promise.all([
    supabase.from("boards").select("*").eq("id", idQuadro).maybeSingle(),
    supabase.rpc("papel_no_quadro", { board_id: idQuadro }),
  ]);

  if (!quadro || !papel) return null;

  const [{ data: listas }, { data: etiquetas }, { data: membros }] =
    await Promise.all([
      supabase
        .from("lists")
        .select("*")
        .eq("board_id", idQuadro)
        .order("posicao"),
      supabase
        .from("labels")
        .select("*")
        .eq("board_id", idQuadro)
        .order("criado_em"),
      supabase
        .from("board_members")
        .select("user_id, papel, perfil:profiles!inner(*)")
        .eq("board_id", idQuadro),
    ]);

  const idsListas = (listas ?? []).map((lista) => lista.id);

  /*
    Uma consulta só para os cartões e as duas ligações: sem isto seriam três
    idas ao servidor e um quadro grande notava-se logo na abertura.

    `attachments!attachments_card_id_fkey` e não `attachments`: desde que a
    capa do cartão existe, há DUAS chaves estrangeiras entre estas tabelas —
    `attachments.card_id` (os anexos de um cartão) e `cards.capa_anexo_id` (o
    anexo que serve de capa). Sem dizer qual, o PostgREST recusa a consulta
    inteira com PGRST201 e o quadro abre sem cartão nenhum.
  */
  const { data: cartoes, error: erroCartoes } = idsListas.length
    ? await supabase
        .from("cards")
        .select(
          "*, card_labels(label_id), card_members(user_id), comments(count), attachments!attachments_card_id_fkey(count)",
        )
        .in("list_id", idsListas)
        .order("posicao")
    : { data: [], error: null };

  /*
    Um quadro com listas e sem cartões nenhuns é indistinguível, no ecrã, de um
    quadro vazio — e foi assim que uma consulta partida passou despercebida.
    Falhar alto é a diferença entre um erro que se vê e um que se descobre
    dias depois.
  */
  if (erroCartoes) {
    console.error("Falha a carregar os cartões do quadro:", erroCartoes);
    throw new Error(
      `Não foi possível carregar os cartões deste quadro: ${erroCartoes.message}`,
    );
  }

  const [quadroComImagem] = await comImagens([quadro], "imagem_fundo");

  return {
    quadro: quadroComImagem,
    listas: (listas ?? []).slice().sort(porPosicao),
    // O cast é a fronteira: os tipos escritos à mão em supabase/tipos.ts não
    // declaram as relações, por isso o PostgREST não consegue inferir o que
    // sai de um select com recursos embutidos. `normalizarCartao` a seguir é
    // que garante a forma.
    cartoes: ((cartoes ?? []) as unknown as CartaoBruto[])
      .map(normalizarCartao)
      .sort(porPosicao),
    etiquetas: etiquetas ?? [],
    membros: (membros ?? []) as unknown as MembroComPerfil[],
    papel: papel as PapelQuadro,
  };
}

type CartaoBruto = Cartao & {
  card_labels?: { label_id: string }[] | null;
  card_members?: { user_id: string }[] | null;
  comments?: { count: number }[] | null;
  attachments?: { count: number }[] | null;
};

function normalizarCartao(bruto: CartaoBruto): CartaoCompleto {
  const { card_labels, card_members, comments, attachments, ...cartao } = bruto;
  return {
    ...cartao,
    etiquetas: (card_labels ?? []).map((l) => l.label_id),
    membros: (card_members ?? []).map((m) => m.user_id),
    nComentarios: comments?.[0]?.count ?? 0,
    nAnexos: attachments?.[0]?.count ?? 0,
  };
}

/** Os quadros do utilizador, para a página inicial. */
export async function carregarQuadros() {
  const supabase = await criarClienteServidor();

  const { data } = await supabase
    .from("boards")
    .select("*, board_members!inner(papel)")
    .order("arquivado")
    .order("nome");

  const quadros = (data ?? []).map((quadro) => {
    const { board_members, ...resto } = quadro as typeof quadro & {
      board_members: { papel: PapelQuadro }[];
    };
    return { ...resto, papel: board_members[0]?.papel ?? "leitor" };
  });

  return comImagens(quadros, "imagem_miniatura");
}
