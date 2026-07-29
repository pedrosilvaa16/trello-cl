import { cookies } from "next/headers";
import { z } from "zod";

import { quemPede, responderErro } from "@/lib/acessos";
import {
  COOKIE_AUTORIZACAO,
  abrirAutorizacao,
  type AutorizacaoPendente,
} from "@/lib/redes/estado";
import {
  paginasDoPortfolio,
  paginasDoUtilizador,
  portfoliosDoUtilizador,
} from "@/lib/redes/meta";
import { guardarSegredo } from "@/lib/redes/segredos";
import { sincronizarLigacao } from "@/lib/redes/sincronizar";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { LigacaoRede } from "@/lib/supabase/tipos";

/**
 * O passo do meio da ligação à Meta: qual é o portfólio, e qual é a conta.
 *
 * Isto existe por causa de como o acesso padrão da Meta funciona, e de como uma
 * agência está organizada. O Pedro autentica-se uma vez com o Facebook dele e
 * fica com acesso a tudo o que está nos portfólios de negócio da Creative Line —
 * dezenas de Páginas, de dezenas de clientes. Escolher a primeira que aparecesse
 * ligava o Instagram de um cliente ao quadro de outro, e o erro só se descobria
 * quando alguém estranhasse os números.
 *
 * Por isso a escolha é em dois passos: primeiro o portfólio do cliente, depois a
 * conta dentro dele. O portfólio corta a lista de quarenta para uma ou duas.
 *
 * A autorização a meio caminho vive num cookie cifrado (`src/lib/redes/estado.ts`)
 * e diz a que quadro pertence: um token pedido para o quadro A não liga nada ao
 * quadro B.
 */

async function autorizacaoPendente(): Promise<AutorizacaoPendente> {
  const armazem = await cookies();
  const pendente = abrirAutorizacao(armazem.get(COOKIE_AUTORIZACAO)?.value);

  if (!pendente) {
    throw new Error(
      "A autorização expirou. Carrega outra vez em «Ligar» para recomeçar.",
    );
  }

  const quem = await quemPede();
  if (quem.id !== pendente.utilizador) {
    throw new Error("Esta autorização é de outra sessão. Volta a ligar a conta.");
  }

  return pendente;
}

/**
 * Sem `portfolio`, devolve os portfólios. Com `portfolio`, devolve as contas
 * que estão lá dentro.
 */
export async function GET(pedido: Request) {
  try {
    const pendente = await autorizacaoPendente();
    const portfolio = new URL(pedido.url).searchParams.get("portfolio");

    if (!portfolio) {
      const portfolios = await portfoliosDoUtilizador(pendente.token);
      return Response.json({
        passo: "portfolio",
        rede: pendente.rede,
        quadro: pendente.quadro,
        portfolios,
        aviso:
          portfolios.length === 0
            ? "Esta conta do Facebook não tem nenhum portfólio de negócio. " +
              "Confirma em business.facebook.com que entraste com a conta certa."
            : null,
      });
    }

    const eInstagram = pendente.rede === "instagram";
    const [todas, doPortfolio] = await Promise.all([
      paginasDoUtilizador(pendente.token),
      paginasDoPortfolio(pendente.token, portfolio),
    ]);

    /*
      A interseção é o que dá sentido a isto: `paginasDoUtilizador` traz tudo a
      que o Pedro tem acesso, e o portfólio diz quais dessas são deste cliente.
      Só o cruzamento das duas é que responde à pergunta certa.
    */
    const contas = todas
      .filter((pagina) => doPortfolio.has(pagina.paginaId))
      // Para o Instagram, só as Páginas com conta de Instagram pendurada — as
      // outras não têm nada para ler, e oferecê-las seria dar erro a seguir.
      .filter((pagina) => (eInstagram ? pagina.instagramId : true))
      .map((pagina) => ({
        id: eInstagram ? (pagina.instagramId as string) : pagina.paginaId,
        pagina: pagina.paginaId,
        nome: eInstagram
          ? (pagina.instagramNome ?? pagina.paginaNome)
          : pagina.paginaNome,
        // A Página é o contexto que distingue dois clientes com nomes parecidos.
        contexto: eInstagram ? pagina.paginaNome : null,
        avatar: eInstagram ? pagina.instagramAvatar : pagina.avatar,
      }));

    return Response.json({
      passo: "conta",
      rede: pendente.rede,
      quadro: pendente.quadro,
      portfolio,
      contas,
      /*
        Uma lista vazia tem causas muito diferentes, e a mensagem tem de dizer
        qual — senão fica-se a olhar para um ecrã vazio sem saber o que fazer.
      */
      aviso:
        contas.length === 0
          ? eInstagram
            ? "Nenhuma Página deste portfólio tem uma conta de Instagram associada. " +
              "A conta do cliente tem de ser Business ou Creator e estar ligada à Página, " +
              "e a Página tem de estar neste portfólio."
            : "Este portfólio não tem Páginas a que esta conta tenha acesso. " +
              "Confirma em business.facebook.com que a Página do cliente está cá dentro " +
              "e que és administrador dela."
          : null,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}

const escolha = z.object({
  conta: z.string().trim().min(1).max(200),
  nome: z.string().trim().min(1).max(200),
  avatar: z.string().trim().max(1000).nullable().optional(),
  /** A Página de onde sai o token. Para o Facebook é a própria conta. */
  pagina: z.string().trim().min(1).max(200),
  /** O portfólio de onde ela veio, para se poder confirmar que veio mesmo. */
  portfolio: z.string().trim().min(1).max(200),
});

/** Liga a conta escolhida ao quadro, guarda o token e sincroniza já. */
export async function POST(pedido: Request) {
  try {
    const pendente = await autorizacaoPendente();

    const validado = escolha.safeParse(await pedido.json().catch(() => null));
    if (!validado.success) {
      return Response.json({ erro: "Pedido inválido." }, { status: 400 });
    }

    /*
      A conta escolhida tem de sair mesmo da lista que a autorização deu, e do
      portfólio que foi escolhido. Aceitar o corpo tal como vem deixava alguém
      pôr um id arbitrário num quadro — não daria acesso a dados nenhuns, mas
      poria um nome falso no painel de um cliente.
    */
    const [todas, doPortfolio] = await Promise.all([
      paginasDoUtilizador(pendente.token),
      paginasDoPortfolio(pendente.token, validado.data.portfolio),
    ]);

    const escolhida = todas.find(
      (pagina) => pagina.paginaId === validado.data.pagina,
    );
    const contaEsperada =
      pendente.rede === "instagram"
        ? escolhida?.instagramId
        : escolhida?.paginaId;

    if (
      !escolhida ||
      !doPortfolio.has(escolhida.paginaId) ||
      contaEsperada !== validado.data.conta
    ) {
      return Response.json(
        { erro: "Essa conta não faz parte deste portfólio. Volta a ligar." },
        { status: 400 },
      );
    }

    const supabase = await criarClienteServidor();
    const { data: idLigacao, error } = await supabase.rpc("definir_ligacao_rede", {
      p_quadro: pendente.quadro,
      p_rede: pendente.rede,
      p_conta: validado.data.conta,
      p_nome: validado.data.nome,
      p_avatar: validado.data.avatar ?? null,
      p_expira_em: pendente.expiraEm,
    });
    if (error) throw error;

    /*
      O token da PÁGINA, e não o do utilizador.

      Um token de Página derivado de um token de utilizador de longa duração não
      caduca enquanto a autorização não for retirada — enquanto o do utilizador
      morre aos sessenta dias. É a diferença entre um painel que funciona sozinho
      e um que pede para ser religado de dois em dois meses, cliente a cliente.
    */
    await guardarSegredo({
      ligacao: idLigacao as string,
      token: escolhida.tokenPagina,
      ambito: `meta:${validado.data.portfolio}`,
    });

    const armazem = await cookies();
    armazem.delete(COOKIE_AUTORIZACAO);

    /*
      Sincroniza já, sem esperar pelo cron. Quem acaba de ligar uma conta quer
      ver o painel a encher-se — e é esta primeira passagem que recupera os
      trinta dias que a Meta ainda tem. Se falhar, a ligação fica de pé à mesma
      e o cron tenta outra vez logo à noite.
    */
    const { data: ligacao } = await supabase
      .from("ligacoes_redes")
      .select("*")
      .eq("id", idLigacao as string)
      .maybeSingle();

    const resultado = ligacao
      ? await sincronizarLigacao(ligacao as LigacaoRede)
      : null;

    return Response.json({
      ligacao: idLigacao,
      nome: validado.data.nome,
      sincronizacao: resultado,
    });
  } catch (erro) {
    return responderErro(erro);
  }
}
