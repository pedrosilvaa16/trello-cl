import "server-only";

import {
  assuntoDoConvite,
  htmlDoConvite,
  textoDoConvite,
  type AcessoNoConvite,
} from "./email-convite";
import { enviarEmail, type ResultadoEnvio } from "./email";
import type { criarClienteServidor } from "./supabase/servidor";
import type { Convite } from "./supabase/tipos";

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

/**
 * Compõe e envia o email de um convite, e regista o envio se ele acontecer.
 *
 * Partilhado entre criar e reenviar, para o email ser o mesmo nos dois casos —
 * duas cópias do mesmo texto divergiriam à primeira correção de gralha.
 *
 * O `enviado_em` só é marcado depois de o Resend aceitar a mensagem. Um painel
 * que diga "enviado" sobre um envio que falhou é pior do que um que não diga
 * nada: manda quem gere esperar por uma coisa que não vem.
 */
export async function enviarConvite({
  convite,
  ligacao,
  supabase,
}: {
  convite: Convite;
  ligacao: string;
  supabase: Cliente;
}): Promise<ResultadoEnvio> {
  // O nome de quem convida e os acessos vêm da mesma consulta que o painel usa,
  // por isso já estão filtrados pelo que quem pede pode ver.
  const [{ data: autor }, { data: acessos }] = await Promise.all([
    convite.criado_por
      ? supabase.from("profiles").select("nome").eq("id", convite.criado_por).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("convite_acessos")
      .select("board_id, card_id, boards(nome), cards(titulo)")
      .eq("convite_id", convite.id),
  ]);

  const lista: AcessoNoConvite[] = ((acessos ?? []) as unknown as AcessoBruto[])
    .map((a) => ({
      tipo: (a.board_id ? "quadro" : "cartao") as AcessoNoConvite["tipo"],
      nome: a.boards?.nome ?? a.cards?.titulo ?? "",
    }))
    .filter((a) => a.nome !== "");

  const quemConvida = (autor as { nome: string } | null)?.nome ?? null;

  const resultado = await enviarEmail({
    para: convite.email,
    assunto: assuntoDoConvite(quemConvida),
    html: htmlDoConvite({
      ligacao,
      quemConvida,
      acessos: lista,
      expiraEm: convite.expira_em,
    }),
    texto: textoDoConvite({
      ligacao,
      quemConvida,
      acessos: lista,
      expiraEm: convite.expira_em,
    }),
  });

  if (resultado.enviado) {
    await supabase.rpc("marcar_convite_enviado", { p_convite: convite.id });
  }

  return resultado;
}

type AcessoBruto = {
  board_id: string | null;
  card_id: string | null;
  boards: { nome: string } | null;
  cards: { titulo: string } | null;
};

/**
 * A origem do pedido, para montar a ligação do convite.
 *
 * Atrás do proxy da Vercel, `pedido.url` traz o host interno; o `x-forwarded-*`
 * é que sabe por onde a pessoa entrou. Um link de convite com o host errado é
 * um link que não abre.
 */
export function origemDe(pedido: Request): string {
  const cabecalhos = pedido.headers;
  const host = cabecalhos.get("x-forwarded-host") ?? cabecalhos.get("host");
  const protocolo = cabecalhos.get("x-forwarded-proto") ?? "https";
  if (host) return `${protocolo}://${host}`;
  return new URL(pedido.url).origin;
}
