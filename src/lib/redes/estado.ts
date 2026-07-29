import "server-only";

import type { RedeSocial } from "@/lib/supabase/tipos";

import { assinar, assinaturaValida, cifrar, decifrar } from "./cifra";

/**
 * O `state` do OAuth, e o que se guarda entre o ida e o volta.
 *
 * O `state` não é segredo — atravessa a barra de endereços do utilizador e os
 * servidores da Meta — mas tem de ser impossível de forjar. Sem assinatura,
 * qualquer pessoa mandava um gestor para o nosso callback com um `board_id` à
 * escolha e ligava a conta dela ao quadro de outro cliente.
 *
 * A defesa é dupla: a assinatura prova que fomos nós que emitimos aquele
 * pedido, e o `utilizador` lá dentro tem de bater certo com quem volta. Um
 * `state` roubado a meio não serve a mais ninguém.
 */

/** Dez minutos. É o tempo de autorizar, não o de ir almoçar. */
const VALIDADE_MS = 10 * 60 * 1000;

export type EstadoOAuth = {
  quadro: string;
  rede: RedeSocial;
  utilizador: string;
};

export function criarEstado(estado: EstadoOAuth): string {
  const carga = Buffer.from(
    JSON.stringify({ ...estado, emitido: Date.now() }),
  ).toString("base64url");
  return `${carga}.${assinar(carga)}`;
}

/**
 * Devolve o estado, ou `null` se não for de confiança.
 *
 * Nulo para tudo o que corre mal — assinatura errada, formato estranho, tempo
 * esgotado. Quem chama não tem nada a decidir com a diferença, e distingui-las
 * na resposta seria contar a quem está a tentar forjar o quê é que falhou.
 */
export function lerEstado(bruto: string | null): EstadoOAuth | null {
  if (!bruto) return null;

  const [carga, assinatura] = bruto.split(".");
  if (!carga || !assinatura) return null;
  if (!assinaturaValida(carga, assinatura)) return null;

  try {
    const dados = JSON.parse(Buffer.from(carga, "base64url").toString("utf8")) as
      EstadoOAuth & { emitido?: number };

    if (!dados.emitido || Date.now() - dados.emitido > VALIDADE_MS) return null;
    if (!dados.quadro || !dados.rede || !dados.utilizador) return null;

    return { quadro: dados.quadro, rede: dados.rede, utilizador: dados.utilizador };
  } catch {
    return null;
  }
}

/* --------------------------------------------- a autorização a meio caminho */

/**
 * O que fica guardado entre o callback e a escolha da conta.
 *
 * Na Meta há um passo pelo meio: a autorização dá acesso a várias Páginas — numa
 * agência, quase sempre às de todos os clientes — e é preciso perguntar qual é a
 * deste quadro. Escolher a primeira ligava o Instagram de um cliente ao quadro
 * de outro, e o erro só apareceria quando alguém estranhasse os números.
 *
 * O token de utilizador vive num cookie cifrado durante esse intervalo. Cifrado
 * e não simplesmente assinado: é um token a sério, e um cookie não é um sítio
 * onde se ponha um segredo em claro. `httpOnly` tira-o do alcance de qualquer
 * JavaScript da página.
 */
export const COOKIE_AUTORIZACAO = "redes_autorizacao";

export type AutorizacaoPendente = {
  quadro: string;
  rede: RedeSocial;
  utilizador: string;
  token: string;
  expiraEm: string | null;
};

export function selarAutorizacao(pendente: AutorizacaoPendente): string {
  return cifrar(JSON.stringify(pendente));
}

export function abrirAutorizacao(
  selada: string | undefined,
): AutorizacaoPendente | null {
  if (!selada) return null;
  try {
    return JSON.parse(decifrar(selada)) as AutorizacaoPendente;
  } catch {
    // Decifra falhada é cookie adulterado ou chave trocada. Nos dois casos a
    // resposta é a mesma: volta a autorizar.
    return null;
  }
}

/** As opções do cookie, num sítio só para não divergirem entre pôr e tirar. */
export const OPCOES_COOKIE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: VALIDADE_MS / 1000,
};
