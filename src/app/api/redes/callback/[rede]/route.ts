import { NextResponse, type NextRequest } from "next/server";

import {
  COOKIE_AUTORIZACAO,
  OPCOES_COOKIE,
  lerEstado,
  selarAutorizacao,
} from "@/lib/redes/estado";
import { fornecedorDe, redirecionamentoDe } from "@/lib/redes/fornecedores";
import { tokenDeUtilizador } from "@/lib/redes/meta";
import { guardarSegredo } from "@/lib/redes/segredos";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { RedeSocial } from "@/lib/supabase/tipos";

/**
 * O regresso da rede social, depois de a pessoa autorizar.
 *
 * Uma rota só para as três plataformas. O `rede` do caminho é a plataforma
 * (`meta`, `linkedin`, `tiktok`) e não a rede do nosso modelo — a Meta é uma
 * app só, e qual das duas redes se está a ligar vem no `state`.
 *
 * Isto responde sempre com um `redirect`, nunca com JSON: quem chega aqui é um
 * browser a voltar de uma autorização, e o que tem de ver é o painel do quadro
 * — com a conta ligada, ou com uma explicação do que falhou.
 */

const PLATAFORMAS = ["meta", "linkedin", "tiktok"] as const;

function voltarAoPainel(
  pedido: NextRequest,
  quadro: string | null,
  parametros: Record<string, string>,
) {
  const destino = pedido.nextUrl.clone();
  destino.pathname = quadro ? `/quadro/${quadro}/estatisticas` : "/";
  destino.search = "";
  for (const [chave, valor] of Object.entries(parametros)) {
    destino.searchParams.set(chave, valor);
  }
  return NextResponse.redirect(destino);
}

export async function GET(
  pedido: NextRequest,
  contexto: { params: Promise<{ rede: string }> },
) {
  const { rede: plataforma } = await contexto.params;
  if (!PLATAFORMAS.includes(plataforma as (typeof PLATAFORMAS)[number])) {
    return voltarAoPainel(pedido, null, { erro: "Plataforma desconhecida." });
  }

  const parametros = pedido.nextUrl.searchParams;
  const estado = lerEstado(parametros.get("state"));

  /*
    Sem `state` válido não se sabe a que quadro é que isto pertence, e por isso
    não há para onde voltar com jeito. É também a única defesa contra alguém
    mandar um gestor para aqui com um `board_id` à escolha — ver
    src/lib/redes/estado.ts.
  */
  if (!estado) {
    return voltarAoPainel(pedido, null, {
      erro: "O pedido de autorização não é válido ou demorou demasiado. Tenta outra vez.",
    });
  }

  // A pessoa recusou na plataforma, ou fechou a janela. Não é um erro nosso.
  const recusa = parametros.get("error_description") ?? parametros.get("error");
  if (recusa) {
    return voltarAoPainel(pedido, estado.quadro, {
      erro: "A autorização foi cancelada. Nada foi ligado.",
    });
  }

  const codigo = parametros.get("code");
  if (!codigo) {
    return voltarAoPainel(pedido, estado.quadro, {
      erro: "A plataforma não devolveu o código de autorização. Tenta outra vez.",
    });
  }

  /*
    O `state` é assinado por nós, mas nada impede que seja reproduzido noutra
    sessão. Confirmar que quem volta é quem partiu, e que continua a poder gerir
    o quadro, fecha isso — e é barato, porque a sessão já está no cookie.
  */
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== estado.utilizador) {
    return voltarAoPainel(pedido, estado.quadro, {
      erro: "A sessão mudou a meio da autorização. Entra e tenta outra vez.",
    });
  }

  const { data: podeGerir } = await supabase.rpc("pode_gerir_quadro", {
    board_id: estado.quadro,
  });
  if (!podeGerir) {
    return voltarAoPainel(pedido, estado.quadro, {
      erro: "Só quem gere o quadro pode ligar contas de redes sociais.",
    });
  }

  try {
    if (plataforma === "meta") {
      return await guardarAutorizacaoMeta(pedido, estado);
    }
    return await ligarDireto(pedido, estado);
  } catch (erro) {
    return voltarAoPainel(pedido, estado.quadro, {
      erro: (erro as Error).message,
    });
  }
}

/**
 * Meta: guarda o token e vai perguntar qual é a Página.
 *
 * Não liga já. Numa agência, a mesma conta de Facebook administra as Páginas de
 * todos os clientes, e ligar a primeira que aparecesse punha o Instagram de um
 * cliente no quadro de outro — um erro que só se descobre quando alguém
 * estranha os números, semanas depois.
 */
async function guardarAutorizacaoMeta(
  pedido: NextRequest,
  estado: { quadro: string; rede: RedeSocial; utilizador: string },
) {
  const { token, expiraEm } = await tokenDeUtilizador(
    pedido.nextUrl.searchParams.get("code") as string,
    redirecionamentoDe(estado.rede),
  );

  const resposta = voltarAoPainel(pedido, estado.quadro, {
    escolher: estado.rede,
  });

  resposta.cookies.set(
    COOKIE_AUTORIZACAO,
    selarAutorizacao({
      quadro: estado.quadro,
      rede: estado.rede,
      utilizador: estado.utilizador,
      token,
      expiraEm: expiraEm?.toISOString() ?? null,
    }),
    OPCOES_COOKIE,
  );

  return resposta;
}

/**
 * LinkedIn e TikTok: uma autorização, uma conta, ligar e acabou.
 *
 * O fornecedor destas recusa-se a escolher por nós quando há mais do que uma
 * hipótese — prefere falhar com uma explicação a ligar a conta errada.
 */
async function ligarDireto(
  pedido: NextRequest,
  estado: { quadro: string; rede: RedeSocial; utilizador: string },
) {
  const conta = await fornecedorDe(estado.rede).trocarCodigo(
    pedido.nextUrl.searchParams.get("code") as string,
    redirecionamentoDe(estado.rede),
  );

  const supabase = await criarClienteServidor();
  const { data: idLigacao, error } = await supabase.rpc("definir_ligacao_rede", {
    p_quadro: estado.quadro,
    p_rede: estado.rede,
    p_conta: conta.contaId,
    p_nome: conta.nome,
    p_avatar: conta.avatar,
    p_expira_em: conta.expiraEm?.toISOString() ?? null,
  });
  if (error) throw new Error(error.message);

  await guardarSegredo({
    ligacao: idLigacao as string,
    token: conta.token,
    refresh: conta.refresh,
    ambito: conta.ambito,
  });

  return voltarAoPainel(pedido, estado.quadro, { ligada: conta.nome });
}
