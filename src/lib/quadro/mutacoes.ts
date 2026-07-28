"use client";

import type { PostgrestError } from "@supabase/supabase-js";

import { criarClienteNavegador } from "../supabase/navegador";
import type { Database, Etiqueta, Lista, PapelQuadro } from "../supabase/tipos";
import type {
  AnexoComAutor,
  CartaoCompleto,
  ComentarioComAutor,
} from "./tipos";

/*
  Os tipos de UPDATE só deixam passar as colunas que fazem sentido alterar. Um
  `Partial<Cartao>` deixaria escrever `id` ou `criado_em` sem erro nenhum.
*/
type AtualizarLista = Database["public"]["Tables"]["lists"]["Update"];
export type AtualizarCartao = Database["public"]["Tables"]["cards"]["Update"];
type AtualizarEtiqueta = Database["public"]["Tables"]["labels"]["Update"];

/**
 * Escritas do quadro.
 *
 * Passam todas pelo cliente do browser, ou seja, por RLS — o que a interface
 * esconde a um `leitor`, a base de dados recusa na mesma. Aqui não há
 * verificações de permissão duplicadas de propósito: a autoridade é uma só.
 */

function rebentar(erro: PostgrestError | null, oQueFalhou: string): void {
  if (!erro) return;

  // 42501 = insufficient_privilege; RLS a recusar a escrita.
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    throw new Error(`Não tens permissão para ${oQueFalhou}.`);
  }
  throw new Error(`Não foi possível ${oQueFalhou}. Tenta outra vez.`);
}

const bd = () => criarClienteNavegador();

/* ---------------------------------------------------------------- listas -- */

export async function criarLista(
  idQuadro: string,
  nome: string,
  posicao: number,
): Promise<Lista> {
  const { data, error } = await bd()
    .from("lists")
    .insert({ board_id: idQuadro, nome, posicao })
    .select()
    .single();
  rebentar(error, "criar a lista");
  return data!;
}

export async function alterarLista(id: string, campos: AtualizarLista) {
  const { error } = await bd().from("lists").update(campos).eq("id", id);
  rebentar(error, "alterar a lista");
}

export async function apagarLista(id: string) {
  const { error } = await bd().from("lists").delete().eq("id", id);
  rebentar(error, "apagar a lista");
}

/** Devolve a posição final — pode não ser a pedida, se o servidor reequilibrar. */
export async function moverLista(id: string, posicao: number): Promise<number> {
  const { data, error } = await bd().rpc("mover_lista", {
    p_lista: id,
    p_posicao: posicao,
  });
  rebentar(error, "mover a lista");
  return data as number;
}

/* --------------------------------------------------------------- cartões -- */

export async function criarCartao(
  idLista: string,
  titulo: string,
  posicao: number,
  idAutor: string,
): Promise<CartaoCompleto> {
  const { data, error } = await bd()
    .from("cards")
    .insert({ list_id: idLista, titulo, posicao, criado_por: idAutor })
    .select()
    .single();
  rebentar(error, "criar o cartão");
  return { ...data!, etiquetas: [], membros: [], nComentarios: 0, nAnexos: 0 };
}

export async function alterarCartao(id: string, campos: AtualizarCartao) {
  const { error } = await bd().from("cards").update(campos).eq("id", id);
  rebentar(error, "alterar o cartão");
}

export async function apagarCartao(id: string) {
  const { error } = await bd().from("cards").delete().eq("id", id);
  rebentar(error, "apagar o cartão");
}

export async function moverCartao(
  id: string,
  idLista: string,
  posicao: number,
): Promise<number> {
  const { data, error } = await bd().rpc("mover_cartao", {
    p_cartao: id,
    p_lista: idLista,
    p_posicao: posicao,
  });
  rebentar(error, "mover o cartão");
  return data as number;
}

/** Relê as posições de uma lista — usado depois de o servidor reequilibrar. */
export async function relerPosicoes(idsListas: string[]) {
  const { data, error } = await bd()
    .from("cards")
    .select("id, list_id, posicao")
    .in("list_id", idsListas);
  rebentar(error, "atualizar as posições");
  return data ?? [];
}

/* ------------------------------------------------------------- etiquetas -- */

export async function criarEtiqueta(
  idQuadro: string,
  nome: string,
  cor: string,
): Promise<Etiqueta> {
  const { data, error } = await bd()
    .from("labels")
    .insert({ board_id: idQuadro, nome, cor })
    .select()
    .single();
  rebentar(error, "criar a etiqueta");
  return data!;
}

export async function alterarEtiqueta(id: string, campos: AtualizarEtiqueta) {
  const { error } = await bd().from("labels").update(campos).eq("id", id);
  rebentar(error, "alterar a etiqueta");
}

export async function apagarEtiqueta(id: string) {
  const { error } = await bd().from("labels").delete().eq("id", id);
  rebentar(error, "apagar a etiqueta");
}

export async function ligarEtiqueta(idCartao: string, idEtiqueta: string) {
  const { error } = await bd()
    .from("card_labels")
    .insert({ card_id: idCartao, label_id: idEtiqueta });
  rebentar(error, "aplicar a etiqueta");
}

export async function desligarEtiqueta(idCartao: string, idEtiqueta: string) {
  const { error } = await bd()
    .from("card_labels")
    .delete()
    .eq("card_id", idCartao)
    .eq("label_id", idEtiqueta);
  rebentar(error, "retirar a etiqueta");
}

/* --------------------------------------------------------------- membros -- */

export async function ligarMembro(idCartao: string, idUtilizador: string) {
  const { error } = await bd()
    .from("card_members")
    .insert({ card_id: idCartao, user_id: idUtilizador });
  rebentar(error, "atribuir o cartão");
}

export async function desligarMembro(idCartao: string, idUtilizador: string) {
  const { error } = await bd()
    .from("card_members")
    .delete()
    .eq("card_id", idCartao)
    .eq("user_id", idUtilizador);
  rebentar(error, "retirar a pessoa do cartão");
}

/** Procura um colaborador pelo email. `null` = ainda não tem conta. */
export async function procurarPerfil(email: string) {
  const { data, error } = await bd().rpc("perfil_por_email", {
    p_email: email,
  });
  rebentar(error, "procurar o colaborador");
  return data ?? null;
}

export async function adicionarMembro(
  idQuadro: string,
  idUtilizador: string,
  papel: PapelQuadro,
) {
  const { error } = await bd()
    .from("board_members")
    .insert({ board_id: idQuadro, user_id: idUtilizador, papel });

  if (error?.code === "23505") {
    throw new Error("Esta pessoa já é membro do quadro.");
  }
  rebentar(error, "adicionar o membro");
}

/**
 * Cria um convite de acesso à plataforma e devolve o link a enviar.
 *
 * O token é gerado aqui com `crypto.randomUUID()` — 122 bits de aleatoriedade
 * criptográfica por cada metade, o que chega e sobra para um segredo que vive
 * sete dias.
 */
export async function criarConvite(
  email: string,
  idQuadro: string | null,
  papel: PapelQuadro,
  idAutor: string,
) {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");

  const { data, error } = await bd()
    .from("convites")
    .insert({
      email: email.trim().toLowerCase(),
      board_id: idQuadro,
      papel,
      token,
      criado_por: idAutor,
    })
    .select()
    .single();

  if (error?.code === "23505") {
    throw new Error(
      "Já existe um convite por usar para este email. Revoga o antigo antes de criar outro.",
    );
  }
  rebentar(error, "criar o convite");

  return {
    convite: data!,
    ligacao: `${window.location.origin}/convite/${token}`,
  };
}

export async function revogarConvite(id: string) {
  const { error } = await bd().from("convites").delete().eq("id", id);
  rebentar(error, "revogar o convite");
}

export async function convitesPendentes(idQuadro: string) {
  const { data, error } = await bd()
    .from("convites")
    .select("*")
    .eq("board_id", idQuadro)
    .is("usado_em", null)
    .order("criado_em", { ascending: false });
  rebentar(error, "ler os convites");
  return data ?? [];
}

export async function alterarPapel(
  idQuadro: string,
  idUtilizador: string,
  papel: PapelQuadro,
) {
  const { error } = await bd()
    .from("board_members")
    .update({ papel })
    .eq("board_id", idQuadro)
    .eq("user_id", idUtilizador);
  rebentar(error, "mudar o papel");
}

export async function removerMembro(idQuadro: string, idUtilizador: string) {
  const { error } = await bd()
    .from("board_members")
    .delete()
    .eq("board_id", idQuadro)
    .eq("user_id", idUtilizador);

  // O trigger do último admin fala português; a mensagem dele é melhor do que
  // qualquer coisa genérica que se escrevesse aqui.
  if (error?.message?.includes("único admin")) {
    throw new Error(
      "É o único admin do quadro. Promove outro membro a admin primeiro.",
    );
  }
  rebentar(error, "remover o membro");
}

/* ----------------------------------------------------------- comentários -- */

export async function listarComentarios(idCartao: string) {
  const { data, error } = await bd()
    .from("comments")
    .select("*, autor:profiles(id, nome, avatar_url)")
    .eq("card_id", idCartao)
    // Do mais antigo para o mais recente: lê-se como uma conversa.
    .order("criado_em", { ascending: true });
  rebentar(error, "ler os comentários");
  return (data ?? []) as unknown as ComentarioComAutor[];
}

export async function criarComentario(
  idCartao: string,
  corpo: string,
  idAutor: string,
) {
  const { data, error } = await bd()
    .from("comments")
    .insert({ card_id: idCartao, corpo, autor_id: idAutor })
    .select("*, autor:profiles(id, nome, avatar_url)")
    .single();
  rebentar(error, "publicar o comentário");
  return data as unknown as ComentarioComAutor;
}

export async function editarComentario(id: string, corpo: string) {
  const { error } = await bd()
    .from("comments")
    .update({ corpo, editado_em: new Date().toISOString() })
    .eq("id", id);
  rebentar(error, "editar o comentário");
}

export async function apagarComentario(id: string) {
  const { error } = await bd().from("comments").delete().eq("id", id);
  rebentar(error, "apagar o comentário");
}

/* ---------------------------------------------------------------- anexos -- */

export async function listarAnexos(idCartao: string) {
  const { data, error } = await bd()
    .from("attachments")
    .select("*, autor:profiles(id, nome)")
    .eq("card_id", idCartao)
    .order("criado_em", { ascending: false });
  rebentar(error, "ler os anexos");
  return (data ?? []) as unknown as AnexoComAutor[];
}

export async function registarAnexo(
  anexo: Database["public"]["Tables"]["attachments"]["Insert"],
) {
  const { data, error } = await bd()
    .from("attachments")
    .insert(anexo)
    .select("*, autor:profiles(id, nome)")
    .single();
  rebentar(error, "registar o anexo");
  return data as unknown as AnexoComAutor;
}

export async function apagarAnexo(id: string) {
  const { error } = await bd().from("attachments").delete().eq("id", id);
  rebentar(error, "remover o anexo");
}

/* ----------------------------------------------------------------- quadro -- */

export async function alterarQuadro(
  id: string,
  campos: { nome?: string; descricao?: string | null; cor?: string; arquivado?: boolean },
) {
  const { error } = await bd().from("boards").update(campos).eq("id", id);
  rebentar(error, "alterar o quadro");
}

/**
 * Cria um quadro e fica-se admin dele.
 *
 * Passa por RPC e não por um INSERT: a linha de board_members tem de nascer na
 * mesma transação, senão um `insert ... returning` falhava a própria política
 * de leitura (nesse instante ainda não se é membro do que se acabou de criar).
 */
export async function criarQuadro(nome: string, cor: string) {
  const { data, error } = await bd().rpc("criar_quadro", {
    p_nome: nome,
    p_cor: cor,
  });
  rebentar(error, "criar o quadro");
  return data!;
}

export async function apagarQuadro(id: string) {
  const { error } = await bd().from("boards").delete().eq("id", id);
  rebentar(error, "apagar o quadro");
}
