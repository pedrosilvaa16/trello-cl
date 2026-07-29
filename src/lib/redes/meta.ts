import "server-only";

import type { DimensaoDemografica, RedeSocial } from "@/lib/supabase/tipos";

import {
  ErroDeRede,
  dia,
  diasEntre,
  type ContaLigada,
  type Fornecedor,
  type Recolha,
} from "./fornecedor";

/**
 * Instagram e Facebook — a Graph API da Meta.
 *
 * As duas redes partilham uma app, um OAuth e um token: quem autoriza dá acesso
 * às Páginas de Facebook que escolher, e a conta de Instagram vem pendurada na
 * Página a que está ligada. Por isso é um ficheiro só, com uma fábrica que
 * devolve o fornecedor de cada uma.
 *
 * O que a Meta exige, e não é código (ver o guia no README):
 *   · conta de Instagram Business ou Creator, ligada a uma Página de Facebook;
 *   · App Review aprovada para `instagram_manage_insights` e
 *     `pages_read_engagement`, sem a qual isto só funciona com as contas de
 *     teste da app;
 *   · verificação de negócio da empresa.
 */

/*
  A versão fica fixada de propósito. A Meta muda o significado das métricas
  entre versões — `impressions` passou a `views`, metade das métricas de Página
  desapareceu na v22 — e um painel que seguisse a "última versão" mudava de
  números sozinho a meio de um mês. Subir de versão é uma decisão, não um
  acidente: muda-se aqui, confirma-se o mapeamento lá em baixo, e pronto.
*/
const VERSAO = process.env.META_API_VERSAO ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${VERSAO}`;
const DIALOGO = `https://www.facebook.com/${VERSAO}/dialog/oauth`;

/*
  ACESSO PADRÃO (Standard Access), e é isso que faz isto funcionar hoje.

  A Meta dá dois níveis. O Avançado deixa uma app ler dados de qualquer conta e
  exige App Review — semanas, às vezes meses. O Padrão vem ligado de origem e
  chega para ler os ativos que estão nos portfólios de negócio a que a app
  pertence e onde quem autoriza tem um papel.

  É exatamente o caso desta agência: as Páginas dos clientes estão nos
  portfólios da Creative Line, com o Pedro como administrador. Por isso não há
  App Review nenhuma a esperar — há um portfólio a escolher.

  A consequência a assumir, e está escrita na interface: um cliente cuja Página
  não esteja num portfólio da agência não tem estatísticas. Não é uma falha da
  ligação, é a fronteira do acesso padrão.

  `business_management` é o que permite listar os portfólios e saber que ativos
  são de qual — sem ele não havia como agrupar por cliente.
*/
const AMBITO = [
  "business_management",
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
].join(",");

function credenciais() {
  const id = process.env.META_APP_ID;
  const segredo = process.env.META_APP_SECRET;
  if (!id || !segredo) {
    throw new ErroDeRede(
      "A app da Meta não está configurada. Falta META_APP_ID ou META_APP_SECRET no ambiente.",
    );
  }
  return { id, segredo };
}

/* ------------------------------------------------------------------ pedidos */

type Resposta = Record<string, unknown>;

/**
 * Um pedido à Graph API.
 *
 * Traduz os erros da Meta para `ErroDeRede`, e é aqui que se decide o que é um
 * token caducado. Os códigos 190 e 102 e o subcódigo 463 são as três formas que
 * a Meta tem de dizer a mesma coisa — "volta a autorizar" — e o painel precisa
 * de as distinguir de uma falha passageira para saber se incomoda o gestor.
 */
async function pedir(
  caminho: string,
  token: string,
  parametros: Record<string, string | number | undefined> = {},
): Promise<Resposta> {
  const url = new URL(`${GRAPH}${caminho}`);
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }
  url.searchParams.set("access_token", token);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      // Estes dados vêm de uma API externa e vivem na nossa base de dados; a
      // cache do Next aqui não serve para nada e só esconderia um pedido falhado.
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (causa) {
    throw new ErroDeRede(
      `Não foi possível falar com a Meta: ${(causa as Error).message}`,
    );
  }

  const corpo = (await resposta.json().catch(() => ({}))) as Resposta;

  if (!resposta.ok) {
    const erro = (corpo.error ?? {}) as {
      message?: string;
      code?: number;
      error_subcode?: number;
      type?: string;
    };
    const expirado =
      erro.code === 190 ||
      erro.code === 102 ||
      erro.error_subcode === 463 ||
      erro.type === "OAuthException";

    throw new ErroDeRede(
      erro.message ?? `A Meta respondeu ${resposta.status}.`,
      expirado,
    );
  }

  return corpo;
}

/** Meia-noite UTC do dia. A Meta espera segundos, não milissegundos. */
function segundos(dataIso: string, maisDias = 0): number {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + maisDias);
  return Math.floor(d.getTime() / 1000);
}

/* -------------------------------------------------------------------- OAuth */

/**
 * O `redirect_uri` tem de ser byte a byte o que está registado na app.
 *
 * Não se monta a partir dos cabeçalhos do pedido, como `origemDe` faz para os
 * convites: por trás da Vercel o `x-forwarded-host` muda entre o domínio de
 * produção e o de pré-visualização, e a Meta recusa o que não reconhecer.
 */
export function redirecionamentoMeta(): string {
  const base = process.env.APP_URL;
  if (!base) {
    throw new ErroDeRede(
      "Falta APP_URL no ambiente. O endereço de retorno do OAuth tem de ser fixo " +
        "e igual ao que está registado na app da Meta.",
    );
  }
  return `${base.replace(/\/$/, "")}/api/redes/callback/meta`;
}

function urlAutorizacao(estado: string, redirecionamento: string): string {
  const { id } = credenciais();
  const url = new URL(DIALOGO);
  url.searchParams.set("client_id", id);
  url.searchParams.set("redirect_uri", redirecionamento);
  url.searchParams.set("state", estado);
  url.searchParams.set("scope", AMBITO);
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/**
 * Troca o código por um token de utilizador de longa duração.
 *
 * São dois passos, e o segundo não é opcional: o token que vem do `code` dura
 * uma ou duas horas. Sem a troca, a primeira sincronização da noite seguinte já
 * falhava, e o cliente via um painel a expirar no dia em que foi ligado.
 */
export async function tokenDeUtilizador(
  codigo: string,
  redirecionamento: string,
): Promise<{ token: string; expiraEm: Date | null }> {
  const { id, segredo } = credenciais();

  const curto = (await pedir("/oauth/access_token", "", {
    client_id: id,
    client_secret: segredo,
    redirect_uri: redirecionamento,
    code: codigo,
  })) as { access_token?: string };

  if (!curto.access_token) {
    throw new ErroDeRede("A Meta não devolveu token nenhum para este código.");
  }

  const longo = (await pedir("/oauth/access_token", "", {
    grant_type: "fb_exchange_token",
    client_id: id,
    client_secret: segredo,
    fb_exchange_token: curto.access_token,
  })) as { access_token?: string; expires_in?: number };

  const token = longo.access_token ?? curto.access_token;
  const expiraEm = longo.expires_in
    ? new Date(Date.now() + longo.expires_in * 1000)
    : null;

  return { token, expiraEm };
}

/** Uma Página candidata a ser ligada, já com a conta de Instagram se houver. */
export type ContaMeta = {
  paginaId: string;
  paginaNome: string;
  tokenPagina: string;
  avatar: string | null;
  instagramId: string | null;
  instagramNome: string | null;
  instagramAvatar: string | null;
};

/** Um portfólio de negócio da agência. */
export type PortfolioMeta = { id: string; nome: string };

/**
 * Os portfólios de negócio a que a conta autorizada tem acesso.
 *
 * É o primeiro passo da ligação, e é o que organiza o resto: cada cliente da
 * agência tem o seu portfólio, e é dentro dele que estão a Página de Facebook e
 * a conta de Instagram desse cliente. Escolher o portfólio antes da Página é o
 * que impede ligar o Instagram de um cliente ao quadro de outro numa lista de
 * quarenta Páginas com nomes parecidos.
 */
export async function portfoliosDoUtilizador(
  token: string,
): Promise<PortfolioMeta[]> {
  const dados = (await pedir("/me/businesses", token, {
    fields: "id,name",
    limit: 100,
  })) as { data?: { id: string; name?: string }[] };

  return (dados.data ?? [])
    .map((negocio) => ({
      id: negocio.id,
      nome: negocio.name ?? `Portfólio ${negocio.id}`,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-PT"));
}

/**
 * Os ids das Páginas que pertencem a um portfólio.
 *
 * Duas arestas, e as duas contam: `owned_pages` são as Páginas do próprio
 * portfólio, `client_pages` são as que um cliente partilhou com ele. Numa
 * agência as duas aparecem — houve clientes cuja Página a agência criou, e
 * outros que já a tinham e a partilharam.
 */
export async function paginasDoPortfolio(
  token: string,
  portfolio: string,
): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const aresta of ["owned_pages", "client_pages"]) {
    try {
      const dados = (await pedir(`/${portfolio}/${aresta}`, token, {
        fields: "id",
        limit: 200,
      })) as { data?: { id: string }[] };

      for (const pagina of dados.data ?? []) ids.add(pagina.id);
    } catch (erro) {
      /*
        Um portfólio sem Páginas partilhadas responde com erro de permissão em
        vez de lista vazia. Não é uma falha: é a resposta. A outra aresta
        continua a valer, e ficar sem nenhuma é tratado por quem chama.
      */
      if (erro instanceof ErroDeRede && erro.expirado) throw erro;
    }
  }

  return ids;
}

/**
 * As Páginas a que a autorização deu acesso, com o token de cada uma.
 *
 * Numa agência isto devolve quase sempre dezenas: a mesma conta de Facebook é
 * administradora das Páginas de todos os clientes. É a lista bruta — quem a
 * usa filtra-a pelo portfólio escolhido.
 */
export async function paginasDoUtilizador(token: string): Promise<ContaMeta[]> {
  const dados = (await pedir("/me/accounts", token, {
    fields:
      "id,name,access_token,picture{url}," +
      "instagram_business_account{id,username,profile_picture_url}",
    limit: 100,
  })) as {
    data?: {
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
      instagram_business_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
    }[];
  };

  return (dados.data ?? []).map((pagina) => ({
    paginaId: pagina.id,
    paginaNome: pagina.name,
    tokenPagina: pagina.access_token,
    avatar: pagina.picture?.data?.url ?? null,
    instagramId: pagina.instagram_business_account?.id ?? null,
    instagramNome: pagina.instagram_business_account?.username ?? null,
    instagramAvatar:
      pagina.instagram_business_account?.profile_picture_url ?? null,
  }));
}

/* -------------------------------------------------------------- Instagram */

/*
  O mapeamento. Cada linha é uma tradução da língua da Meta para o vocabulário
  da casa, e é o único sítio onde os nomes deles aparecem.

  `views` substituiu `impressions` — a Meta descontinuou o segundo. Se um dia
  voltar a mudar, muda-se aqui e nem os gráficos nem a base de dados dão por isso.
*/
const SERIE_INSTAGRAM: Record<string, string> = {
  reach: "alcance",
  views: "visualizacoes",
};

const TOTAIS_INSTAGRAM: Record<string, string> = {
  profile_views: "visitas_perfil",
  website_clicks: "cliques_site",
  total_interactions: "interacoes",
  likes: "gostos",
  comments: "comentarios",
  shares: "partilhas",
  saves: "guardados",
};

async function recolherInstagram(entrada: {
  token: string;
  contaId: string;
  desde: Date;
  ate: Date;
}): Promise<Recolha> {
  const { token, contaId, desde, ate } = entrada;
  const recolha: Recolha = {
    metricas: [],
    demografia: [],
    publicacoes: [],
    avisos: [],
  };
  const hoje = dia(ate);

  /*
    Um bloco que falha não leva os outros atrás. Uma conta sem demografia (a
    Meta só a dá acima de cem seguidores) tem à mesma seguidores e alcance, e
    guardar metade é infinitamente melhor do que guardar nada — sobretudo
    porque o que não for guardado hoje perde-se para sempre.

    A exceção é o token caducado: esse rebenta para cima, porque não é uma
    métrica que falta, é a ligação inteira que morreu.
  */
  const tentar = async (o_que: string, bloco: () => Promise<void>) => {
    try {
      await bloco();
    } catch (erro) {
      if (erro instanceof ErroDeRede && erro.expirado) throw erro;
      recolha.avisos.push(`${o_que}: ${(erro as Error).message}`);
    }
  };

  // --- Retrato de hoje: seguidores, a seguir, publicações -------------------
  await tentar("seguidores", async () => {
    const perfil = (await pedir(`/${contaId}`, token, {
      fields: "followers_count,follows_count,media_count",
    })) as {
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    };

    const retrato: [string, number | undefined][] = [
      ["seguidores", perfil.followers_count],
      ["a_seguir", perfil.follows_count],
      ["publicacoes", perfil.media_count],
    ];
    for (const [metrica, valor] of retrato) {
      if (typeof valor === "number") {
        recolha.metricas.push({ dia: hoje, metrica, valor });
      }
    }
  });

  // --- Séries diárias: alcance e visualizações -----------------------------
  await tentar("alcance e visualizações", async () => {
    const dados = (await pedir(`/${contaId}/insights`, token, {
      metric: Object.keys(SERIE_INSTAGRAM).join(","),
      period: "day",
      since: segundos(dia(desde)),
      until: segundos(hoje, 1),
    })) as {
      data?: { name: string; values?: { value: number; end_time: string }[] }[];
    };

    for (const serie of dados.data ?? []) {
      const metrica = SERIE_INSTAGRAM[serie.name];
      if (!metrica) continue;
      for (const ponto of serie.values ?? []) {
        /*
          `end_time` é o fim da janela, ou seja a meia-noite do dia SEGUINTE ao
          que o valor descreve. Guardar sem recuar um dia empurrava a série
          inteira 24 horas para a frente e punha o alcance de segunda no gráfico
          de terça.
        */
        const fim = new Date(ponto.end_time);
        fim.setUTCDate(fim.getUTCDate() - 1);
        recolha.metricas.push({
          dia: dia(fim),
          metrica,
          valor: Number(ponto.value) || 0,
        });
      }
    }
  });

  // --- Totais, um dia de cada vez ------------------------------------------
  /*
    Estas métricas só existem com `metric_type=total_value`, que devolve UM
    número para a janela inteira em vez de uma série. Para termos série, pede-se
    janela a janela — um pedido por dia.

    Numa sincronização diária isso são dois ou três pedidos. Só a primeira, que
    recupera o histórico que a Meta ainda tem, é que faz trinta — e essa
    acontece uma vez na vida da ligação.
  */
  const dias = diasEntre(desde, ate);
  for (const d of dias) {
    await tentar(`totais de ${d}`, async () => {
      const dados = (await pedir(`/${contaId}/insights`, token, {
        metric: Object.keys(TOTAIS_INSTAGRAM).join(","),
        period: "day",
        metric_type: "total_value",
        since: segundos(d),
        until: segundos(d, 1),
      })) as { data?: { name: string; total_value?: { value?: number } }[] };

      for (const serie of dados.data ?? []) {
        const metrica = TOTAIS_INSTAGRAM[serie.name];
        if (!metrica) continue;
        recolha.metricas.push({
          dia: d,
          metrica,
          valor: Number(serie.total_value?.value) || 0,
        });
      }
    });
  }

  // --- Demografia ----------------------------------------------------------
  await tentar("demografia", async () => {
    const cortes: { breakdown: string; dimensao: DimensaoDemografica }[] = [
      { breakdown: "age", dimensao: "idade" },
      { breakdown: "gender", dimensao: "genero" },
      { breakdown: "country", dimensao: "pais" },
      { breakdown: "city", dimensao: "cidade" },
    ];

    for (const corte of cortes) {
      const dados = (await pedir(`/${contaId}/insights`, token, {
        metric: "follower_demographics",
        period: "lifetime",
        metric_type: "total_value",
        breakdown: corte.breakdown,
      })) as {
        data?: {
          total_value?: {
            breakdowns?: {
              results?: { dimension_values?: string[]; value?: number }[];
            }[];
          };
        }[];
      };

      const resultados =
        dados.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];

      for (const linha of resultados) {
        const grupo = linha.dimension_values?.[0];
        if (!grupo) continue;
        recolha.demografia.push({
          dia: hoje,
          dimensao: corte.dimensao,
          grupo,
          valor: Number(linha.value) || 0,
        });
      }
    }

    if (recolha.demografia.length === 0) {
      recolha.avisos.push(
        "A Meta não devolveu demografia. Acontece em contas com menos de 100 seguidores.",
      );
    }
  });

  // --- Publicações ---------------------------------------------------------
  await tentar("publicações", async () => {
    const lista = (await pedir(`/${contaId}/media`, token, {
      fields:
        "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
      since: segundos(dia(desde)),
      limit: 50,
    })) as {
      data?: {
        id: string;
        caption?: string;
        media_type?: string;
        media_product_type?: string;
        media_url?: string;
        thumbnail_url?: string;
        permalink?: string;
        timestamp: string;
      }[];
    };

    for (const peca of lista.data ?? []) {
      const metricas: Record<string, number> = {};

      // Os números de cada peça são um pedido por peça. Se um falhar, a peça
      // entra na mesma sem eles — uma grelha com miniaturas e datas vale mais
      // do que uma grelha vazia.
      try {
        const insights = (await pedir(`/${peca.id}/insights`, token, {
          metric: "reach,likes,comments,saved,shares,views",
        })) as { data?: { name: string; values?: { value: number }[] }[] };

        const traducao: Record<string, string> = {
          reach: "alcance",
          likes: "gostos",
          comments: "comentarios",
          saved: "guardados",
          shares: "partilhas",
          views: "visualizacoes",
        };

        for (const serie of insights.data ?? []) {
          const nome = traducao[serie.name];
          if (nome) metricas[nome] = Number(serie.values?.[0]?.value) || 0;
        }
      } catch (erro) {
        if (erro instanceof ErroDeRede && erro.expirado) throw erro;
      }

      recolha.publicacoes.push({
        id_externo: peca.id,
        publicado_em: peca.timestamp,
        tipo: tipoDaPeca(peca.media_type, peca.media_product_type),
        url: peca.permalink ?? null,
        miniatura_url: peca.thumbnail_url ?? peca.media_url ?? null,
        legenda: peca.caption ?? null,
        metricas,
      });
    }
  });

  return recolha;
}

function tipoDaPeca(tipo?: string, produto?: string): string | null {
  if (produto === "REELS") return "reel";
  if (produto === "STORY") return "story";
  switch (tipo) {
    case "IMAGE":
      return "imagem";
    case "VIDEO":
      return "video";
    case "CAROUSEL_ALBUM":
      return "carrossel";
    default:
      return tipo?.toLowerCase() ?? null;
  }
}

/* --------------------------------------------------------------- Facebook */

const SERIE_FACEBOOK: Record<string, string> = {
  page_impressions_unique: "alcance",
  page_impressions: "visualizacoes",
  page_post_engagements: "interacoes",
  page_views_total: "visitas_perfil",
};

async function recolherFacebook(entrada: {
  token: string;
  contaId: string;
  desde: Date;
  ate: Date;
}): Promise<Recolha> {
  const { token, contaId, desde, ate } = entrada;
  const recolha: Recolha = {
    metricas: [],
    demografia: [],
    publicacoes: [],
    avisos: [],
  };
  const hoje = dia(ate);

  const tentar = async (o_que: string, bloco: () => Promise<void>) => {
    try {
      await bloco();
    } catch (erro) {
      if (erro instanceof ErroDeRede && erro.expirado) throw erro;
      recolha.avisos.push(`${o_que}: ${(erro as Error).message}`);
    }
  };

  await tentar("seguidores", async () => {
    const pagina = (await pedir(`/${contaId}`, token, {
      fields: "followers_count,fan_count",
    })) as { followers_count?: number; fan_count?: number };

    const seguidores = pagina.followers_count ?? pagina.fan_count;
    if (typeof seguidores === "number") {
      recolha.metricas.push({ dia: hoje, metrica: "seguidores", valor: seguidores });
    }
  });

  await tentar("métricas da Página", async () => {
    const dados = (await pedir(`/${contaId}/insights`, token, {
      metric: Object.keys(SERIE_FACEBOOK).join(","),
      period: "day",
      since: segundos(dia(desde)),
      until: segundos(hoje, 1),
    })) as {
      data?: { name: string; values?: { value: number; end_time: string }[] }[];
    };

    for (const serie of dados.data ?? []) {
      const metrica = SERIE_FACEBOOK[serie.name];
      if (!metrica) continue;
      for (const ponto of serie.values ?? []) {
        const fim = new Date(ponto.end_time);
        fim.setUTCDate(fim.getUTCDate() - 1);
        recolha.metricas.push({
          dia: dia(fim),
          metrica,
          valor: Number(ponto.value) || 0,
        });
      }
    }
  });

  /*
    A demografia de Página foi das que a Meta cortou nas versões recentes, e o
    que resta varia com a versão da API e com o tamanho da Página. Pede-se, e se
    não vier fica um aviso em vez de um erro — o painel do Facebook vale a pena
    sem ela, e a do Instagram, que é a que interessa a uma agência, continua lá.
  */
  await tentar("demografia da Página", async () => {
    const dados = (await pedir(`/${contaId}/insights`, token, {
      metric: "page_fans_country,page_fans_city,page_fans_gender_age",
      period: "lifetime",
    })) as {
      data?: { name: string; values?: { value?: Record<string, number> }[] }[];
    };

    const dimensoes: Record<string, DimensaoDemografica> = {
      page_fans_country: "pais",
      page_fans_city: "cidade",
      page_fans_gender_age: "genero",
    };

    for (const serie of dados.data ?? []) {
      const dimensao = dimensoes[serie.name];
      const valores = serie.values?.[0]?.value ?? {};
      if (!dimensao) continue;

      for (const [grupo, valor] of Object.entries(valores)) {
        recolha.demografia.push({
          dia: hoje,
          dimensao,
          // `page_fans_gender_age` vem como "F.25-34"; guarda-se só o género,
          // que é a dimensão que a tabela declara.
          grupo: dimensao === "genero" ? grupo.split(".")[0] : grupo,
          valor: Number(valor) || 0,
        });
      }
    }
  });

  await tentar("publicações", async () => {
    const lista = (await pedir(`/${contaId}/posts`, token, {
      fields: "id,message,created_time,permalink_url,full_picture",
      since: segundos(dia(desde)),
      limit: 50,
    })) as {
      data?: {
        id: string;
        message?: string;
        created_time: string;
        permalink_url?: string;
        full_picture?: string;
      }[];
    };

    for (const peca of lista.data ?? []) {
      const metricas: Record<string, number> = {};
      try {
        const insights = (await pedir(`/${peca.id}/insights`, token, {
          metric: "post_impressions_unique,post_clicks,post_reactions_by_type_total",
        })) as { data?: { name: string; values?: { value: unknown }[] }[] };

        for (const serie of insights.data ?? []) {
          const bruto = serie.values?.[0]?.value;
          if (serie.name === "post_impressions_unique") {
            metricas.alcance = Number(bruto) || 0;
          } else if (serie.name === "post_clicks") {
            metricas.cliques_site = Number(bruto) || 0;
          } else if (serie.name === "post_reactions_by_type_total") {
            // Vem como {like: 3, love: 1, …}: o que interessa é o total.
            metricas.gostos = Object.values(
              (bruto as Record<string, number>) ?? {},
            ).reduce((soma, n) => soma + (Number(n) || 0), 0);
          }
        }
      } catch (erro) {
        if (erro instanceof ErroDeRede && erro.expirado) throw erro;
      }

      recolha.publicacoes.push({
        id_externo: peca.id,
        publicado_em: peca.created_time,
        tipo: peca.full_picture ? "imagem" : "texto",
        url: peca.permalink_url ?? null,
        miniatura_url: peca.full_picture ?? null,
        legenda: peca.message ?? null,
        metricas,
      });
    }
  });

  return recolha;
}

/* ----------------------------------------------------------------- fábrica */

/**
 * O fornecedor de uma das duas redes da Meta.
 *
 * `trocarCodigo` não é usado por estas: o callback da Meta precisa de um passo
 * pelo meio — perguntar qual das Páginas é que é deste cliente — e por isso a
 * rota chama `tokenDeUtilizador` e `paginasDoUtilizador` diretamente. Fica
 * implementado à mesma, e a lançar, para o contrato não ter um buraco calado.
 */
export function fornecedorMeta(rede: "instagram" | "facebook"): Fornecedor {
  return {
    rede: rede as RedeSocial,
    disponivel: true,
    configurado: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    urlAutorizacao,
    async trocarCodigo(): Promise<ContaLigada> {
      throw new ErroDeRede(
        "A ligação à Meta passa por escolher a Página. Ver /api/redes/callback/meta.",
      );
    },
    recolher: rede === "instagram" ? recolherInstagram : recolherFacebook,
  };
}
