import "server-only";

import { criarClienteServidor } from "./supabase/servidor";
import type { PapelGlobal } from "./supabase/tipos";

/**
 * Autorização do lado do servidor.
 *
 * Toda a rota de gestão começa por aqui: quem é que está a pedir, e com que
 * papel global. A resposta vem sempre da sessão do pedido e da base de dados,
 * nunca de um cabeçalho, de um corpo de pedido ou de estado do cliente — o
 * papel global que o browser conhece serve para desenhar a interface e mais
 * nada.
 *
 * A segunda linha de defesa é o RLS e as funções SECURITY DEFINER, que voltam
 * a verificar tudo. Isto existe para dar respostas HTTP decentes (401, 403) em
 * vez de deixar o Postgres rebentar com uma mensagem que não é para ler.
 */

export type QuemPede = {
  id: string;
  papelGlobal: PapelGlobal;
  ativo: boolean;
};

/** Falha com o estado HTTP certo. As rotas apanham-na em `responderErro`. */
export class ErroDeAcesso extends Error {
  constructor(
    readonly estado: number,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeAcesso";
  }
}

/**
 * Quem está a fazer o pedido.
 *
 * `getUser()` e não `getSession()`: só o primeiro valida o token contra o
 * servidor de autenticação. O segundo confia no cookie, que é exatamente
 * aquilo em que não se pode confiar do lado do servidor.
 */
export async function quemPede(): Promise<QuemPede> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new ErroDeAcesso(401, "Sem sessão iniciada.");
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id, papel_global, ativo")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil) {
    // Sessão válida sem perfil só acontece se alguém apagou a linha à mão. Não
    // há papel nenhum a atribuir a isto, e adivinhar seria o erro.
    throw new ErroDeAcesso(403, "Esta conta não tem perfil na plataforma.");
  }

  if (!perfil.ativo) {
    throw new ErroDeAcesso(403, "Esta conta está desativada.");
  }

  return { id: perfil.id, papelGlobal: perfil.papel_global, ativo: perfil.ativo };
}

/** Só o super_admin: papéis globais, ativar e desativar contas. */
export async function exigirSuperAdmin(): Promise<QuemPede> {
  const quem = await quemPede();
  if (quem.papelGlobal !== "super_admin") {
    throw new ErroDeAcesso(403, "Esta ação é exclusiva de um super_admin.");
  }
  return quem;
}

/** super_admin ou admin: o painel de pessoas e os convites. */
export async function exigirAdmin(): Promise<QuemPede> {
  const quem = await quemPede();
  if (quem.papelGlobal === "externo") {
    throw new ErroDeAcesso(403, "Esta área é de quem gere pessoas.");
  }
  return quem;
}

/**
 * Traduz o que vier para uma resposta HTTP.
 *
 * Os erros das funções SQL chegam aqui como `PostgrestError` com um `code`
 * SQLSTATE. A mensagem delas é escrita para ser lida por uma pessoa, por isso
 * passa; o que nunca passa é o detalhe interno de um erro inesperado.
 */
export function responderErro(erro: unknown): Response {
  if (erro instanceof ErroDeAcesso) {
    return Response.json({ erro: erro.message }, { status: erro.estado });
  }

  const codigo = (erro as { code?: string } | null)?.code;
  const mensagem = (erro as { message?: string } | null)?.message;

  if (codigo && mensagem) {
    const estado = ESTADO_POR_SQLSTATE[codigo] ?? 400;
    return Response.json({ erro: mensagem }, { status: estado });
  }

  console.error("Erro não esperado numa rota de gestão:", erro);
  return Response.json(
    { erro: "Não foi possível concluir a operação. Tenta outra vez." },
    { status: 500 },
  );
}

const ESTADO_POR_SQLSTATE: Record<string, number> = {
  "42501": 403, // insufficient_privilege
  P0001: 400, // raise_exception genérico
  "23514": 400, // check_violation
  "23505": 409, // unique_violation
  "23503": 400, // foreign_key_violation
  "02000": 404, // no_data_found
};

/**
 * Token de convite: 244 bits de aleatoriedade criptográfica.
 *
 * É o único segredo que circula por email, e vive sete dias. Dois UUID v4
 * concatenados chegam e sobram, e não obrigam a mais nenhuma dependência.
 */
export function gerarToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}
