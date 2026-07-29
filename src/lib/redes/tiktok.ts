import "server-only";

import {
  ErroDeRede,
  dia,
  type ContaLigada,
  type Fornecedor,
  type Recolha,
} from "./fornecedor";

/**
 * TikTok — Display API.
 *
 * Vale a pena esclarecer o que esta rede dá e o que não dá, porque é diferente
 * das outras e a diferença aparece no painel:
 *
 *   · A **Display API** — a que se aprova em dias, não em meses — dá o número
 *     de seguidores, de quem a conta segue, de gostos e de vídeos, e dá os
 *     números de cada vídeo. Chega para o bloco de comunidade e para a grelha
 *     de publicações, que é a maior parte do que um cliente quer ver.
 *   · **Alcance diário e demografia do público** só existem na Business API,
 *     que tem aprovação própria e mais demorada.
 *
 * Este ficheiro implementa a Display API. Quando a Business API for aprovada,
 * acrescenta-se a recolha diária aqui e o painel enche-se sozinho — os gráficos
 * não sabem de onde vêm os números.
 *
 * Como o do LinkedIn, nunca correu contra a API a sério. Segue a documentação.
 */

const AUTORIZACAO = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN = "https://open.tiktokapis.com/v2/oauth/token/";
const API = "https://open.tiktokapis.com/v2";

const AMBITO = ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"].join(",");

function credenciais() {
  const chave = process.env.TIKTOK_CLIENT_KEY;
  const segredo = process.env.TIKTOK_CLIENT_SECRET;
  if (!chave || !segredo) {
    throw new ErroDeRede(
      "O TikTok ainda não está ligado. Falta TIKTOK_CLIENT_KEY ou TIKTOK_CLIENT_SECRET no ambiente.",
    );
  }
  return { chave, segredo };
}

export function redirecionamentoTiktok(): string {
  const base = process.env.APP_URL;
  if (!base) throw new ErroDeRede("Falta APP_URL no ambiente.");
  return `${base.replace(/\/$/, "")}/api/redes/callback/tiktok`;
}

/** O TikTok devolve 200 com o erro lá dentro. Verificar só o status não chega. */
function verificarErro(corpo: {
  error?: { code?: string; message?: string };
}): void {
  const codigo = corpo.error?.code;
  if (!codigo || codigo === "ok") return;
  throw new ErroDeRede(
    corpo.error?.message ?? `O TikTok respondeu ${codigo}.`,
    codigo === "access_token_invalid" || codigo === "scope_not_authorized",
  );
}

export const fornecedorTiktok: Fornecedor = {
  rede: "tiktok",
  disponivel: true,
  configurado: () =>
    Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),

  urlAutorizacao(estado, redirecionamento) {
    const { chave } = credenciais();
    const url = new URL(AUTORIZACAO);
    url.searchParams.set("client_key", chave);
    url.searchParams.set("scope", AMBITO);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirecionamento);
    url.searchParams.set("state", estado);
    return url.toString();
  },

  async trocarCodigo(codigo, redirecionamento): Promise<ContaLigada> {
    const { chave, segredo } = credenciais();

    const resposta = await fetch(TOKEN, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: chave,
        client_secret: segredo,
        code: codigo,
        grant_type: "authorization_code",
        redirect_uri: redirecionamento,
      }),
    });

    const dados = (await resposta.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error_description?: string;
    };

    if (!resposta.ok || !dados.access_token) {
      throw new ErroDeRede(
        dados.error_description ?? "O TikTok não devolveu token nenhum.",
      );
    }

    const perfil = await fetch(
      `${API}/user/info/?fields=open_id,display_name,avatar_url`,
      {
        cache: "no-store",
        headers: { Authorization: `Bearer ${dados.access_token}` },
      },
    );
    const corpo = (await perfil.json().catch(() => ({}))) as {
      data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
      error?: { code?: string; message?: string };
    };
    verificarErro(corpo);

    const utilizador = corpo.data?.user;
    if (!utilizador?.open_id) {
      throw new ErroDeRede("O TikTok não devolveu a conta autorizada.");
    }

    return {
      contaId: utilizador.open_id,
      nome: utilizador.display_name ?? "Conta TikTok",
      avatar: utilizador.avatar_url ?? null,
      token: dados.access_token,
      refresh: dados.refresh_token ?? null,
      expiraEm: dados.expires_in
        ? new Date(Date.now() + dados.expires_in * 1000)
        : null,
      ambito: dados.scope ?? AMBITO,
    };
  },

  async recolher({ token, ate }): Promise<Recolha> {
    const recolha: Recolha = {
      metricas: [],
      demografia: [],
      publicacoes: [],
      avisos: [],
    };
    const hoje = dia(ate);

    // --- Retrato da conta --------------------------------------------------
    const perfil = await fetch(
      `${API}/user/info/?fields=follower_count,following_count,likes_count,video_count`,
      { cache: "no-store", headers: { Authorization: `Bearer ${token}` } },
    );
    const corpo = (await perfil.json().catch(() => ({}))) as {
      data?: {
        user?: {
          follower_count?: number;
          following_count?: number;
          likes_count?: number;
          video_count?: number;
        };
      };
      error?: { code?: string; message?: string };
    };
    verificarErro(corpo);

    const u = corpo.data?.user ?? {};
    const retrato: [string, number | undefined][] = [
      ["seguidores", u.follower_count],
      ["a_seguir", u.following_count],
      ["publicacoes", u.video_count],
    ];
    for (const [metrica, valor] of retrato) {
      if (typeof valor === "number") {
        recolha.metricas.push({ dia: hoje, metrica, valor });
      }
    }

    // --- Vídeos ------------------------------------------------------------
    try {
      const lista = await fetch(
        `${API}/video/list/?fields=id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count`,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ max_count: 20 }),
        },
      );
      const videos = (await lista.json().catch(() => ({}))) as {
        data?: {
          videos?: {
            id: string;
            title?: string;
            video_description?: string;
            create_time?: number;
            cover_image_url?: string;
            share_url?: string;
            view_count?: number;
            like_count?: number;
            comment_count?: number;
            share_count?: number;
          }[];
        };
        error?: { code?: string; message?: string };
      };
      verificarErro(videos);

      for (const video of videos.data?.videos ?? []) {
        recolha.publicacoes.push({
          id_externo: video.id,
          publicado_em: new Date((video.create_time ?? 0) * 1000).toISOString(),
          tipo: "video",
          url: video.share_url ?? null,
          miniatura_url: video.cover_image_url ?? null,
          legenda: video.video_description ?? video.title ?? null,
          metricas: {
            visualizacoes: video.view_count ?? 0,
            gostos: video.like_count ?? 0,
            comentarios: video.comment_count ?? 0,
            partilhas: video.share_count ?? 0,
          },
        });
      }
    } catch (erro) {
      if (erro instanceof ErroDeRede && erro.expirado) throw erro;
      recolha.avisos.push(`vídeos: ${(erro as Error).message}`);
    }

    recolha.avisos.push(
      "O TikTok só dá alcance diário e demografia do público pela Business API, que tem aprovação própria.",
    );

    return recolha;
  },
};
