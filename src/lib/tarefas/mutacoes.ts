"use client";

import type { PostgrestError } from "@supabase/supabase-js";

import { criarClienteNavegador } from "../supabase/navegador";
import type {
  AnexoTarefa,
  Database,
  EspacoTarefas,
  ListaTarefas,
  Tarefa,
} from "../supabase/tipos";

/*
  Os tipos de UPDATE só deixam passar as colunas que faz sentido alterar. Um
  `Partial<Tarefa>` deixaria escrever `espaco_id` ou `atualizado_em` sem erro
  nenhum aqui — e depois levava 42501 do Postgres, que é o pior sítio para se
  descobrir um erro destes.
*/
export type AtualizarTarefa = Database["public"]["Tables"]["tarefas"]["Update"];
type AtualizarLista = Database["public"]["Tables"]["tarefa_listas"]["Update"];
type AtualizarEspaco = Database["public"]["Tables"]["tarefa_espacos"]["Update"];

/**
 * Escritas do separador «Tarefas».
 *
 * Passam todas pelo cliente do browser, ou seja, por RLS — exatamente como as
 * do quadro. Não há verificações de permissão repetidas deste lado de
 * propósito: `pode_gerir_tarefas()` é a autoridade, e uma segunda cópia da
 * regra em TypeScript só criava a oportunidade de as duas divergirem.
 */

function rebentar(erro: PostgrestError | null, oQueFalhou: string): void {
  if (!erro) return;

  // 42501 = insufficient_privilege; RLS ou GRANT de coluna a recusar a escrita.
  if (erro.code === "42501" || erro.message.includes("row-level security")) {
    throw new Error(`Não tens permissão para ${oQueFalhou}.`);
  }

  /*
    As guardas das subtarefas (`raise exception` nos triggers) chegam com a
    mensagem já escrita para ser lida por uma pessoa — «Uma subtarefa não pode
    ter subtarefas.». Essa passa tal como está; trocá-la por um texto genérico
    era deitar fora a única explicação útil que existe.
  */
  if (erro.code === "P0001") {
    throw new Error(erro.message);
  }

  throw new Error(`Não foi possível ${oQueFalhou}. Tenta outra vez.`);
}

const bd = () => criarClienteNavegador();

/* ---------------------------------------------------------------- espaços -- */

export async function criarEspaco(
  nome: string,
  cor: EspacoTarefas["cor"],
): Promise<EspacoTarefas> {
  const { data: posicao } = await bd().rpc("posicao_fim_espacos");
  const { data, error } = await bd()
    .from("tarefa_espacos")
    .insert({ nome, cor, posicao: posicao ?? 1 })
    .select()
    .single();
  rebentar(error, "criar o espaço");
  return data!;
}

export async function alterarEspaco(id: string, campos: AtualizarEspaco) {
  const { error } = await bd()
    .from("tarefa_espacos")
    .update(campos)
    .eq("id", id);
  rebentar(error, "alterar o espaço");
}

/**
 * Arquivar e não apagar.
 *
 * Apagar um espaço leva as listas e as tarefas todas por cascata, e é
 * exatamente o tipo de clique que não se desfaz. Arquivar tira-o da vista e
 * deixa tudo lá — que é o que a pessoa quer dizer em 99 vezes de 100.
 */
export async function arquivarEspaco(id: string) {
  const { error } = await bd()
    .from("tarefa_espacos")
    .update({ arquivado: true })
    .eq("id", id);
  rebentar(error, "arquivar o espaço");
}

/* ----------------------------------------------------------------- listas -- */

export async function criarListaTarefas(
  idEspaco: string,
  nome: string,
): Promise<ListaTarefas> {
  const { data: posicao } = await bd().rpc("posicao_fim_listas", {
    p_espaco: idEspaco,
  });
  const { data, error } = await bd()
    .from("tarefa_listas")
    .insert({ espaco_id: idEspaco, nome, posicao: posicao ?? 1 })
    .select()
    .single();
  rebentar(error, "criar a lista");
  return data!;
}

export async function alterarListaTarefas(id: string, campos: AtualizarLista) {
  const { error } = await bd()
    .from("tarefa_listas")
    .update(campos)
    .eq("id", id);
  rebentar(error, "alterar a lista");
}

export async function arquivarListaTarefas(id: string) {
  const { error } = await bd()
    .from("tarefa_listas")
    .update({ arquivada: true })
    .eq("id", id);
  rebentar(error, "arquivar a lista");
}

/* ---------------------------------------------------------------- tarefas -- */

export async function criarTarefa(campos: {
  lista_id: string;
  titulo: string;
  criado_por: string;
  mae_id?: string | null;
  data_limite?: string | null;
  prioridade?: Tarefa["prioridade"];
}): Promise<Tarefa> {
  const { data: posicao } = await bd().rpc("posicao_fim_lista_tarefas", {
    p_lista: campos.lista_id,
  });

  const { data, error } = await bd()
    .from("tarefas")
    .insert({ ...campos, posicao: posicao ?? 1 })
    .select()
    .single();
  rebentar(error, "criar a tarefa");
  return data!;
}

export async function alterarTarefa(id: string, campos: AtualizarTarefa) {
  const { error } = await bd().from("tarefas").update(campos).eq("id", id);
  rebentar(error, "alterar a tarefa");
}

/**
 * Arquivar, o caminho normal para tirar uma tarefa da frente.
 *
 * Não é o mesmo que `estado: 'concluida'`. Concluída é «fez-se»; arquivada é
 * «decidiu-se não fazer». Confundir as duas dá uma métrica de trabalho feito
 * que conta o que se desistiu de fazer.
 */
export async function arquivarTarefa(id: string) {
  const { error } = await bd()
    .from("tarefas")
    .update({ arquivada: true })
    .eq("id", id);
  rebentar(error, "arquivar a tarefa");
}

export async function apagarTarefa(id: string) {
  const { error } = await bd().from("tarefas").delete().eq("id", id);
  rebentar(error, "apagar a tarefa");
}

/* ----------------------------------------------------------- responsáveis -- */

export async function ligarResponsavel(idTarefa: string, idPessoa: string) {
  const { error } = await bd()
    .from("tarefa_responsaveis")
    .insert({ tarefa_id: idTarefa, user_id: idPessoa });
  rebentar(error, "atribuir a tarefa");
}

export async function desligarResponsavel(idTarefa: string, idPessoa: string) {
  const { error } = await bd()
    .from("tarefa_responsaveis")
    .delete()
    .eq("tarefa_id", idTarefa)
    .eq("user_id", idPessoa);
  rebentar(error, "tirar o responsável");
}

/* --------------------------------------------------------------- documentos */

export async function listarAnexos(idTarefa: string): Promise<AnexoTarefa[]> {
  const { data, error } = await bd()
    .from("tarefa_anexos")
    .select("*")
    .eq("tarefa_id", idTarefa)
    .order("criado_em", { ascending: false });
  rebentar(error, "ler os documentos");
  return data ?? [];
}

/**
 * Envia um documento para o R2 e regista-o.
 *
 * Três passos, e a ordem importa: o servidor autoriza e diz para onde, o
 * ficheiro sobe do browser direto para o R2 — sem passar por nenhuma função
 * serverless, que é o que permite 200 MB — e só no fim se escreve a linha. Ao
 * contrário, um erro a meio deixava uma linha a apontar para um ficheiro que
 * nunca chegou.
 */
export async function enviarAnexo(
  idTarefa: string,
  ficheiro: File,
  idPessoa: string,
): Promise<AnexoTarefa> {
  const tipoMime = ficheiro.type || "application/octet-stream";

  const autorizacao = await fetch("/api/tarefas/anexos/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tarefa: idTarefa,
      nomeFicheiro: ficheiro.name.slice(0, 255),
      tamanho: ficheiro.size,
      tipoMime,
    }),
  });

  if (!autorizacao.ok) {
    const corpo = await autorizacao.json().catch(() => ({}));
    throw new Error(corpo.erro ?? "Não foi possível preparar o envio.");
  }

  const { chave, url } = (await autorizacao.json()) as {
    chave: string;
    url: string;
  };

  const subida = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": tipoMime },
    body: ficheiro,
  });

  if (!subida.ok) {
    throw new Error("O envio do ficheiro falhou. Tenta outra vez.");
  }

  const { data, error } = await bd()
    .from("tarefa_anexos")
    // Sem `id`: nasce do default da tabela, e não está no GRANT de INSERT.
    .insert({
      tarefa_id: idTarefa,
      nome_ficheiro: ficheiro.name.slice(0, 255),
      caminho_storage: chave,
      tamanho_bytes: ficheiro.size,
      tipo_mime: tipoMime,
      carregado_por: idPessoa,
    })
    .select()
    .single();
  rebentar(error, "registar o documento");
  return data!;
}

/**
 * Remove um documento.
 *
 * Pela rota e não pelo cliente: apagar a linha é só metade do trabalho, e a
 * outra metade — apagar o objeto no R2 — precisa de credenciais que nunca saem
 * do servidor.
 */
export async function removerAnexo(id: string) {
  const resposta = await fetch(`/api/tarefas/anexos/${id}`, {
    method: "DELETE",
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro ?? "Não foi possível remover o documento.");
  }
}
