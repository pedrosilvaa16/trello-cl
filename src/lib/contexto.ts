import "server-only";

import { createHash } from "node:crypto";

import { criarClienteServidor } from "./supabase/servidor";
import type { TipoAprendizagem } from "./supabase/tipos";

/**
 * Montagem do contexto de um cliente.
 *
 * Isto lê dados verdadeiros da base de dados. Não há aqui nada simulado: o que
 * sai daqui é, palavra por palavra, o que um modelo de linguagem receberá no
 * dia em que for ligado. É por isso que o painel «O que a AI vê» mostra o
 * resultado desta função e não uma aproximação — quando uma sugestão for má,
 * quem gere o quadro tem de poder olhar para a entrada em vez de concluir que
 * a ferramenta não presta.
 *
 * A permissão não é verificada aqui: estas consultas passam todas pelo RLS com
 * a sessão de quem pede, e as tabelas do separador só se leem com
 * `pode_gerir_quadro`. Quem não gere o quadro recebe blocos vazios — e as
 * rotas, essas, respondem 404 antes de chegar cá.
 */

export type TipoTarefa =
  | "ideias"
  | "legenda"
  | "guiao"
  | "voz_marca"
  | "diagnostico";

export type Publicado = {
  titulo: string;
  descricao: string | null;
  formato: string | null;
  data: string | null;
  etiquetas: string[];
};

export type Referencia = {
  titulo: string;
  porque: string | null;
  url: string | null;
  etiquetas: string[];
};

export type Aprendizagem = {
  texto: string;
  tipo: TipoAprendizagem;
  data: string;
};

export type ContextoMontado = {
  blocos: {
    estrategia: string;
    vozMarca: string;
    publicados: Publicado[];
    referencias: Referencia[];
    aprendizagens: Aprendizagem[];
  };
  /** O prompt final, já montado. É isto que seria enviado. */
  texto: string;
  estatisticas: {
    totalPublicados: number;
    totalReferencias: number;
    /** As que têm o porquê preenchido. É o número que mais decide a qualidade. */
    referenciasComPorque: number;
    totalAprendizagens: number;
    temEstrategia: boolean;
    temVozMarca: boolean;
    caracteres: number;
    tokensEstimados: number;
  };
  hash: string;
};

/** Quantos publicados e referências entram. Mais do que isto é ruído. */
const LIMITE_PUBLICADOS = 40;
const LIMITE_REFERENCIAS = 40;
const LIMITE_APRENDIZAGENS = 60;

export async function montarContexto(
  boardId: string,
  tarefa: TipoTarefa,
): Promise<ContextoMontado> {
  const supabase = await criarClienteServidor();

  /*
    As listas primeiro, porque é delas que sai o resto. Pelo TIPO e nunca pelo
    nome: «Ideias e Referências» num quadro, «Inspiração» noutro, e uma procura
    por nome devolve zero no primeiro quadro que fuja ao padrão — em silêncio,
    que é a pior maneira de falhar.
  */
  const [{ data: contexto }, { data: listas }, { data: aprendizagens }] =
    await Promise.all([
      supabase
        .from("board_contexto")
        .select("estrategia, voz_marca")
        .eq("board_id", boardId)
        .maybeSingle(),
      supabase
        .from("lists")
        .select("id, tipo")
        .eq("board_id", boardId)
        .eq("arquivada", false),
      supabase
        .from("aprendizagens")
        .select("texto, tipo, criado_em")
        .eq("board_id", boardId)
        .order("criado_em", { ascending: false })
        .limit(LIMITE_APRENDIZAGENS),
    ]);

  const idsPublicados = (listas ?? [])
    .filter((l) => l.tipo === "publicados")
    .map((l) => l.id);
  const idsReferencias = (listas ?? [])
    .filter((l) => l.tipo === "referencias")
    .map((l) => l.id);

  const [publicados, referencias] = await Promise.all([
    cartoesDe(supabase, idsPublicados, LIMITE_PUBLICADOS),
    cartoesDe(supabase, idsReferencias, LIMITE_REFERENCIAS),
  ]);

  const nomesEtiqueta = await mapaDeEtiquetas(supabase, boardId);

  const blocos = {
    estrategia: contexto?.estrategia?.trim() ?? "",
    vozMarca: contexto?.voz_marca?.trim() ?? "",
    publicados: publicados.map((c) => ({
      titulo: c.titulo,
      descricao: c.descricao,
      formato: formatoDe(c.titulo),
      data: c.data_limite ?? c.criado_em,
      etiquetas: etiquetasDe(c, nomesEtiqueta),
    })),
    referencias: referencias.map((c) => ({
      titulo: c.titulo,
      porque: c.referencia_porque,
      url: c.referencia_url,
      etiquetas: etiquetasDe(c, nomesEtiqueta),
    })),
    aprendizagens: (aprendizagens ?? []).map((a) => ({
      texto: a.texto,
      tipo: a.tipo,
      data: a.criado_em,
    })),
  };

  const texto = montarTexto(blocos, tarefa);

  return {
    blocos,
    texto,
    estatisticas: {
      totalPublicados: blocos.publicados.length,
      totalReferencias: blocos.referencias.length,
      referenciasComPorque: blocos.referencias.filter((r) => !!r.porque?.trim())
        .length,
      totalAprendizagens: blocos.aprendizagens.length,
      temEstrategia: blocos.estrategia.length > 0,
      temVozMarca: blocos.vozMarca.length > 0,
      caracteres: texto.length,
      // Aproximado de propósito: quatro caracteres por token está perto o
      // suficiente para dizer «isto cabe» ou «isto é grande de mais», que é
      // para o que serve. Contar a sério obrigaria a um tokenizador.
      tokensEstimados: Math.ceil(texto.length / 4),
    },
    hash: createHash("sha256").update(texto).digest("hex").slice(0, 32),
  };
}

/* ------------------------------------------------------------- consultas -- */

type ClienteServidor = Awaited<ReturnType<typeof criarClienteServidor>>;

type CartaoDeContexto = {
  titulo: string;
  descricao: string | null;
  data_limite: string | null;
  criado_em: string;
  referencia_porque: string | null;
  referencia_url: string | null;
  card_labels: { label_id: string }[] | null;
};

async function cartoesDe(
  supabase: ClienteServidor,
  idsListas: string[],
  limite: number,
): Promise<CartaoDeContexto[]> {
  // Um quadro sem listas do tipo não é um erro — é um quadro por preparar. A
  // consulta com `in` vazio devolveria tudo, que é exatamente o contrário.
  if (idsListas.length === 0) return [];

  const { data } = await supabase
    .from("cards")
    .select(
      "titulo, descricao, data_limite, criado_em, referencia_porque, referencia_url, card_labels(label_id)",
    )
    .in("list_id", idsListas)
    .eq("arquivado", false)
    .order("criado_em", { ascending: false })
    .limit(limite);

  return (data ?? []) as unknown as CartaoDeContexto[];
}

async function mapaDeEtiquetas(supabase: ClienteServidor, boardId: string) {
  const { data } = await supabase
    .from("labels")
    .select("id, nome")
    .eq("board_id", boardId);

  const mapa = new Map<string, string>();
  for (const etiqueta of data ?? []) {
    // Etiquetas sem nome (só cor) não dizem nada a um modelo. Ficam de fora.
    if (etiqueta.nome?.trim()) mapa.set(etiqueta.id, etiqueta.nome.trim());
  }
  return mapa;
}

function etiquetasDe(cartao: CartaoDeContexto, nomes: Map<string, string>) {
  return (cartao.card_labels ?? [])
    .map((l) => nomes.get(l.label_id))
    .filter((nome): nome is string => !!nome);
}

/**
 * O formato, adivinhado pelo prefixo do título.
 *
 * A convenção da casa é «PUB 6_…», «VID_…», «REEL_…». Não é um campo, é um
 * hábito — e um hábito lido com cuidado vale mais do que uma coluna nova que
 * ninguém preenche. Quando falhar, devolve nulo e ninguém fica pior.
 */
function formatoDe(titulo: string): string | null {
  const marca = titulo.match(/^([A-Za-zÀ-ÿ]{2,10})[\s_\d]*[_:]/);
  if (!marca) return null;

  const conhecidos: Record<string, string> = {
    pub: "publicação",
    post: "publicação",
    vid: "vídeo",
    video: "vídeo",
    reel: "reel",
    reels: "reel",
    story: "story",
    stories: "story",
    carrossel: "carrossel",
  };
  return conhecidos[marca[1].toLowerCase()] ?? null;
}

/* --------------------------------------------------------------- o texto -- */

const INSTRUCOES: Record<TipoTarefa, string> = {
  ideias:
    "Propõe ideias de conteúdo novas para este cliente, coerentes com a estratégia e a voz descritas acima.",
  legenda:
    "Escreve legendas para este cliente, na voz descrita acima.",
  guiao:
    "Escreve um guião curto para vídeo, na voz descrita acima.",
  voz_marca:
    "A partir das publicações acima, descreve a voz desta marca: tom, vocabulário, ritmo, o que evita.",
  diagnostico:
    "Diz o que falta neste contexto para as sugestões saírem melhores, e o que já está bem.",
};

/**
 * A ordem NÃO é por conveniência de leitura.
 *
 * Primeiro os blocos estáveis — estratégia, voz, publicados, referências,
 * aprendizagens — e só no fim o pedido, que muda a cada chamada. É o que
 * permitirá prompt caching quando o modelo entrar: tudo o que está antes do
 * primeiro byte diferente pode ser reaproveitado entre pedidos, e trocar isto
 * de sítio deita fora essa poupança sem dar sinal nenhum.
 */
function montarTexto(
  blocos: ContextoMontado["blocos"],
  tarefa: TipoTarefa,
): string {
  const partes: string[] = [];

  partes.push(
    "Estás a trabalhar como parte da equipa de conteúdos de uma agência. " +
      "Tudo o que se segue é o contexto acumulado sobre UM cliente concreto.",
  );

  partes.push(
    seccao(
      "ESTRATÉGIA",
      blocos.estrategia || "(por preencher)",
    ),
  );

  partes.push(seccao("VOZ DA MARCA", blocos.vozMarca || "(por preencher)"));

  partes.push(
    seccao(
      "JÁ PUBLICADO",
      blocos.publicados.length === 0
        ? "(nada registado)"
        : blocos.publicados
            .map((p) => {
              const cabeca = [
                p.formato ? `[${p.formato}]` : null,
                p.titulo,
                p.etiquetas.length ? `(${p.etiquetas.join(", ")})` : null,
              ]
                .filter(Boolean)
                .join(" ");
              const corpo = p.descricao?.trim();
              return corpo ? `- ${cabeca}\n  ${resumir(corpo)}` : `- ${cabeca}`;
            })
            .join("\n"),
    ),
  );

  partes.push(
    seccao(
      "REFERÊNCIAS",
      blocos.referencias.length === 0
        ? "(nada registado)"
        : blocos.referencias
            .map((r) => {
              const cabeca = [
                r.titulo,
                r.etiquetas.length ? `(${r.etiquetas.join(", ")})` : null,
              ]
                .filter(Boolean)
                .join(" ");
              // O porquê é o que transforma uma imagem bonita em contexto. Sem
              // ele, dizê-lo por extenso é melhor do que deixar a linha muda.
              const porque = r.porque?.trim()
                ? `  porquê: ${resumir(r.porque)}`
                : "  porquê: (por preencher)";
              const url = r.url?.trim() ? `\n  ${r.url.trim()}` : "";
              return `- ${cabeca}\n${porque}${url}`;
            })
            .join("\n"),
    ),
  );

  partes.push(
    seccao(
      "APRENDIZAGENS",
      blocos.aprendizagens.length === 0
        ? "(nada registado)"
        : blocos.aprendizagens
            .map((a) => `- [${NOME_TIPO[a.tipo]}] ${a.texto.trim()}`)
            .join("\n"),
    ),
  );

  // O pedido no fim, sempre. Ver a nota acima.
  partes.push(seccao("PEDIDO", INSTRUCOES[tarefa]));

  return partes.join("\n\n");
}

const NOME_TIPO: Record<TipoAprendizagem, string> = {
  funcionou: "funcionou",
  nao_funcionou: "não funcionou",
  nota: "nota",
};

function seccao(titulo: string, corpo: string) {
  return `## ${titulo}\n${corpo}`;
}

/** Descrições longas entram cortadas: o que interessa está sempre no início. */
function resumir(texto: string, maximo = 400) {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= maximo ? limpo : `${limpo.slice(0, maximo)}…`;
}
