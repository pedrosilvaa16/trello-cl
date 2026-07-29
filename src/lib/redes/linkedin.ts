import "server-only";

import {
  ErroDeRede,
  dia,
  type ContaLigada,
  type Fornecedor,
  type Recolha,
} from "./fornecedor";

/**
 * LinkedIn — Community Management API.
 *
 * É a rede com o caminho mais longo até funcionar, e nada disso é código: o
 * LinkedIn exige empresa registada, Página verificada e duas rondas de
 * aprovação (Development e depois Standard, esta com gravação de ecrã a
 * demonstrar o produto).
 *
 * O ficheiro está inteiro à mesma. `configurado()` devolve falso enquanto as
 * variáveis de ambiente não existirem, e é isso — e não uma constante no
 * código — que decide se o botão aparece. No dia em que a aprovação chegar,
 * preenche-se `LINKEDIN_CLIENT_ID` e `LINKEDIN_CLIENT_SECRET` e liga. Sem
 * nova migração, sem novo deploy de lógica.
 *
 * Aviso honesto a quem retomar isto: ao contrário do fornecedor da Meta, este
 * nunca correu contra a API a sério — não há aprovação para o testar. O que
 * está aqui segue a documentação; conta com um ou dois ajustes de nomes de
 * campo na primeira ligação real.
 */

/*
  O LinkedIn versiona por cabeçalho, não por caminho. A versão fica fixada pela
  mesma razão que a da Meta: um painel que seguisse a última versão mudava de
  números sozinho.
*/
const VERSAO = process.env.LINKEDIN_API_VERSAO ?? "202606";
const API = "https://api.linkedin.com/rest";
const AUTORIZACAO = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN = "https://www.linkedin.com/oauth/v2/accessToken";

const AMBITO = ["r_organization_social", "r_organization_followers", "rw_organization_admin"].join(" ");

function credenciais() {
  const id = process.env.LINKEDIN_CLIENT_ID;
  const segredo = process.env.LINKEDIN_CLIENT_SECRET;
  if (!id || !segredo) {
    throw new ErroDeRede(
      "O LinkedIn ainda não está ligado. Falta LINKEDIN_CLIENT_ID ou LINKEDIN_CLIENT_SECRET no ambiente.",
    );
  }
  return { id, segredo };
}

async function pedir(
  caminho: string,
  token: string,
  parametros: Record<string, string | number | undefined> = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`${API}${caminho}`);
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }

  const resposta = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": VERSAO,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });

  const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;

  if (!resposta.ok) {
    // 401 é token caducado; o LinkedIn dá 60 dias e não tem refresh no plano
    // base, portanto isto acontece a cada dois meses e tem de ser visível.
    throw new ErroDeRede(
      (corpo.message as string) ?? `O LinkedIn respondeu ${resposta.status}.`,
      resposta.status === 401,
    );
  }

  return corpo;
}

export function redirecionamentoLinkedin(): string {
  const base = process.env.APP_URL;
  if (!base) throw new ErroDeRede("Falta APP_URL no ambiente.");
  return `${base.replace(/\/$/, "")}/api/redes/callback/linkedin`;
}

export const fornecedorLinkedin: Fornecedor = {
  rede: "linkedin",
  disponivel: true,
  configurado: () =>
    Boolean(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET),

  urlAutorizacao(estado, redirecionamento) {
    const { id } = credenciais();
    const url = new URL(AUTORIZACAO);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirecionamento);
    url.searchParams.set("state", estado);
    url.searchParams.set("scope", AMBITO);
    return url.toString();
  },

  async trocarCodigo(codigo, redirecionamento): Promise<ContaLigada> {
    const { id, segredo } = credenciais();

    const resposta = await fetch(TOKEN, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: codigo,
        redirect_uri: redirecionamento,
        client_id: id,
        client_secret: segredo,
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
        dados.error_description ?? "O LinkedIn não devolveu token nenhum.",
      );
    }

    // A organização de que a pessoa é administradora. Como na Meta, pode ser
    // mais do que uma — e a rota de callback é que pergunta qual.
    const acls = (await pedir("/organizationAcls", dados.access_token, {
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      projection: "(elements*(organization~(id,localizedName,vanityName)))",
    })) as {
      elements?: {
        "organization~"?: { id?: number; localizedName?: string };
        organization?: string;
      }[];
    };

    const organizacoes = (acls.elements ?? [])
      .map((elemento) => elemento["organization~"])
      .filter((o): o is { id: number; localizedName?: string } =>
        Boolean(o?.id),
      );

    if (organizacoes.length === 0) {
      throw new ErroDeRede(
        "Esta conta do LinkedIn não administra nenhuma Página de empresa. " +
          "Confirma que é administradora da Página do cliente.",
      );
    }

    /*
      Mais do que uma e recusa-se a adivinhar.

      Ligar a primeira que aparecesse punha a Página de um cliente no quadro de
      outro, e o erro só se descobriria quando alguém estranhasse os números. A
      Meta resolve isto com um ecrã a perguntar qual; aqui, enquanto a aprovação
      não chega e não há como testar esse ecrã, prefere-se falhar e dizer o que
      fazer a ligar a conta errada em silêncio.
    */
    if (organizacoes.length > 1) {
      throw new ErroDeRede(
        `Esta conta administra ${organizacoes.length} Páginas de empresa no LinkedIn ` +
          `(${organizacoes.map((o) => o.localizedName).filter(Boolean).join(", ")}). ` +
          "Autoriza a partir de uma conta que administre só a Página deste cliente.",
      );
    }

    const organizacao = organizacoes[0];

    return {
      contaId: String(organizacao.id),
      nome: organizacao.localizedName ?? `Organização ${organizacao.id}`,
      avatar: null,
      token: dados.access_token,
      refresh: dados.refresh_token ?? null,
      expiraEm: dados.expires_in
        ? new Date(Date.now() + dados.expires_in * 1000)
        : null,
      ambito: dados.scope ?? AMBITO,
    };
  },

  async recolher({ token, contaId, desde, ate }): Promise<Recolha> {
    const recolha: Recolha = {
      metricas: [],
      demografia: [],
      publicacoes: [],
      avisos: [],
    };
    const hoje = dia(ate);
    const urn = `urn:li:organization:${contaId}`;

    const tentar = async (o_que: string, bloco: () => Promise<void>) => {
      try {
        await bloco();
      } catch (erro) {
        if (erro instanceof ErroDeRede && erro.expirado) throw erro;
        recolha.avisos.push(`${o_que}: ${(erro as Error).message}`);
      }
    };

    await tentar("seguidores", async () => {
      const dados = (await pedir("/networkSizes/" + urn, token, {
        edgeType: "COMPANY_FOLLOWED_BY_MEMBER",
      })) as { firstDegreeSize?: number };

      if (typeof dados.firstDegreeSize === "number") {
        recolha.metricas.push({
          dia: hoje,
          metrica: "seguidores",
          valor: dados.firstDegreeSize,
        });
      }
    });

    await tentar("alcance e interações", async () => {
      const dados = (await pedir("/organizationalEntityShareStatistics", token, {
        q: "organizationalEntity",
        organizationalEntity: urn,
        "timeIntervals.timeRange.start": desde.getTime(),
        "timeIntervals.timeRange.end": ate.getTime(),
        "timeIntervals.timeGranularityType": "DAY",
      })) as {
        elements?: {
          timeRange?: { start?: number };
          totalShareStatistics?: {
            impressionCount?: number;
            uniqueImpressionsCount?: number;
            engagement?: number;
            likeCount?: number;
            commentCount?: number;
            shareCount?: number;
            clickCount?: number;
          };
        }[];
      };

      for (const ponto of dados.elements ?? []) {
        const d = ponto.timeRange?.start ? dia(new Date(ponto.timeRange.start)) : hoje;
        const t = ponto.totalShareStatistics ?? {};
        const traducao: [string, number | undefined][] = [
          ["visualizacoes", t.impressionCount],
          ["alcance", t.uniqueImpressionsCount],
          ["gostos", t.likeCount],
          ["comentarios", t.commentCount],
          ["partilhas", t.shareCount],
          ["cliques_site", t.clickCount],
        ];
        for (const [metrica, valor] of traducao) {
          if (typeof valor === "number") {
            recolha.metricas.push({ dia: d, metrica, valor });
          }
        }
        // O LinkedIn não dá "interações" somadas; soma-se aqui, com a mesma
        // definição que o vocabulário promete.
        recolha.metricas.push({
          dia: d,
          metrica: "interacoes",
          valor:
            (t.likeCount ?? 0) + (t.commentCount ?? 0) + (t.shareCount ?? 0),
        });
      }
    });

    /*
      O LinkedIn não dá idade nem género — nunca deu, e é uma diferença de
      produto, não uma falta de permissão. Dá país, função e antiguidade. Só o
      país cabe no vocabulário da casa; o resto ficaria a inventar dimensões que
      as outras redes não têm e que o painel não saberia desenhar.
    */
    await tentar("demografia", async () => {
      const dados = (await pedir("/organizationalEntityFollowerStatistics", token, {
        q: "organizationalEntity",
        organizationalEntity: urn,
      })) as {
        elements?: {
          followerCountsByGeoCountry?: {
            geo?: string;
            followerCounts?: { organicFollowerCount?: number; paidFollowerCount?: number };
          }[];
        }[];
      };

      for (const linha of dados.elements?.[0]?.followerCountsByGeoCountry ?? []) {
        const codigo = linha.geo?.split(":").pop();
        if (!codigo) continue;
        recolha.demografia.push({
          dia: hoje,
          dimensao: "pais",
          grupo: codigo,
          valor:
            (linha.followerCounts?.organicFollowerCount ?? 0) +
            (linha.followerCounts?.paidFollowerCount ?? 0),
        });
      }

      recolha.avisos.push(
        "O LinkedIn não fornece idade nem género do público. Não é uma falta de permissão: nunca fez parte da API.",
      );
    });

    return recolha;
  },
};
