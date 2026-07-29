import type { DimensaoDemografica } from "@/lib/supabase/tipos";

import { diasDaJanela, type LinhaDeMetrica } from "./agregar";

/**
 * Dados de demonstração, para os quadros que ainda não têm ligação.
 *
 * Um cliente que abre o separador e encontra um ecrã vazio fica com a
 * impressão de que a ferramenta não faz nada. O que ele vê em vez disso é o
 * painel completo, com a forma exata que vai ter quando os números forem os
 * dele — e uma frase a dizer que ainda não são.
 *
 * DUAS REGRAS, e nenhuma é negociável:
 *
 *   1. **Nunca se confunde com o real.** Quem chama isto passa
 *      `demonstracao: true` para a página inteira, e a página põe a marca de
 *      exemplo por cima. Um número inventado sem essa marca é uma mentira a um
 *      cliente, e um screenshot dele anda depois por aí sozinho.
 *   2. **É estável.** Os valores nascem de um gerador semeado pelo id do
 *      quadro, e por isso são sempre os mesmos para o mesmo cliente. Números a
 *      dançar a cada recarga não parecem uma demonstração, parecem uma avaria —
 *      e destruíam a confiança no painel a sério.
 *
 * A escala é a de um negócio local português, do tamanho dos clientes da casa:
 * algumas centenas de seguidores, alcance na ordem das centenas por dia,
 * público concentrado no distrito. Números de influenciador aqui seriam uma
 * promessa que ninguém fez.
 */

/**
 * Gerador determinístico.
 *
 * `mulberry32`: trinta e duas linhas de aritmética inteira, sem dependência
 * nenhuma, e a mesma semente dá sempre a mesma sequência. É o que faz um
 * quadro ter os seus números e não os do vizinho.
 */
function gerador(semente: number) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O id do quadro reduzido a um inteiro. Mesma técnica que um hash de string. */
function semente(texto: string): number {
  let valor = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    valor ^= texto.charCodeAt(i);
    valor = Math.imul(valor, 16777619);
  }
  return valor >>> 0;
}

export type DadosDemonstracao = {
  metricas: LinhaDeMetrica[];
  demografia: {
    dia: string;
    dimensao: DimensaoDemografica;
    grupo: string;
    valor: number;
  }[];
  publicacoes: {
    id: string;
    id_externo: string;
    publicado_em: string;
    tipo: string | null;
    url: string | null;
    miniatura_url: string | null;
    legenda: string | null;
    metricas: Record<string, number>;
  }[];
};

const LEGENDAS = [
  "Novidades da semana. Passa por cá para veres tudo.",
  "Bastidores do trabalho de hoje.",
  "Obrigado a todos os que passaram no fim de semana.",
  "Já conheces o novo horário?",
  "Uma escolha para quem gosta de coisas bem feitas.",
  "O que anda a sair da nossa oficina.",
  "Aberto hoje até às 19h.",
  "Isto é para ti, se andas à procura de algo diferente.",
  "Três dicas rápidas de quem faz isto todos os dias.",
  "Antes e depois. A diferença está nos detalhes.",
  "Chegou o que estavam à espera.",
  "Marca já a tua visita pela mensagem direta.",
];

const CIDADES = [
  "Marco de Canaveses",
  "Penafiel",
  "Amarante",
  "Lousada",
  "Porto",
  "Paredes",
  "Baião",
];

/**
 * Um painel inteiro de demonstração para um quadro.
 *
 * `ate` é o último dia da janela, e `dias` o comprimento dela — os mesmos que o
 * painel a sério usa, para a demonstração ter exatamente a forma do que vem
 * depois.
 */
export function dadosDeDemonstracao(
  idQuadro: string,
  ate: string,
  dias: number,
): DadosDemonstracao {
  const aleatorio = gerador(semente(idQuadro));
  const janela = diasDaJanela(recuarDias(ate, dias * 2 - 1), ate);

  const metricas: LinhaDeMetrica[] = [];

  /*
    A curva dos seguidores.

    Sobe sempre, mas não em linha reta: a subida por dia varia, e há dias parados.
    Uma reta perfeita seria a primeira coisa a denunciar que os dados são falsos,
    e a segunda seria uma curva que desce — ninguém põe uma quebra num exemplo.
  */
  let seguidores = 380 + Math.floor(aleatorio() * 260);
  const aSeguir = 180 + Math.floor(aleatorio() * 150);
  let publicacoes = 60 + Math.floor(aleatorio() * 90);

  janela.forEach((dia, indice) => {
    const fimDeSemana = [0, 6].includes(new Date(`${dia}T00:00:00Z`).getUTCDay());

    // A segunda metade da janela cresce um pouco mais depressa: é o período
    // "atual", e é o que faz a comparação com o anterior dar boas notícias.
    const impulso = indice > janela.length / 2 ? 1.6 : 1;
    const ganho = Math.round(aleatorio() * 3.2 * impulso);
    seguidores += ganho;

    if (aleatorio() > 0.72) publicacoes += 1;

    metricas.push({ dia, metrica: "seguidores", valor: seguidores });
    metricas.push({ dia, metrica: "a_seguir", valor: aSeguir });
    metricas.push({ dia, metrica: "publicacoes", valor: publicacoes });

    /*
      O alcance segue os dias da semana — menos ao fim de semana, como acontece
      quase sempre num negócio local. É o pormenor que faz um gráfico parecer
      medido em vez de gerado.
    */
    const base = (fimDeSemana ? 0.55 : 1) * (140 + aleatorio() * 210) * impulso;
    const alcance = Math.round(base);
    const visualizacoes = Math.round(alcance * (1.3 + aleatorio() * 0.7));
    const gostos = Math.round(alcance * (0.05 + aleatorio() * 0.05));
    const comentarios = Math.round(gostos * (0.06 + aleatorio() * 0.1));
    const partilhas = Math.round(gostos * (0.04 + aleatorio() * 0.08));
    const guardados = Math.round(gostos * (0.08 + aleatorio() * 0.12));

    metricas.push({ dia, metrica: "alcance", valor: alcance });
    metricas.push({ dia, metrica: "visualizacoes", valor: visualizacoes });
    metricas.push({ dia, metrica: "gostos", valor: gostos });
    metricas.push({ dia, metrica: "comentarios", valor: comentarios });
    metricas.push({ dia, metrica: "partilhas", valor: partilhas });
    metricas.push({ dia, metrica: "guardados", valor: guardados });
    metricas.push({
      dia,
      metrica: "interacoes",
      valor: gostos + comentarios + partilhas + guardados,
    });
    metricas.push({
      dia,
      metrica: "visitas_perfil",
      valor: Math.round(alcance * (0.04 + aleatorio() * 0.04)),
    });
    metricas.push({
      dia,
      metrica: "cliques_site",
      valor: Math.round(alcance * (0.008 + aleatorio() * 0.014)),
    });
  });

  /* ------------------------------------------------------------ demografia */

  const demografia: DadosDemonstracao["demografia"] = [];
  const empurrar = (dimensao: DimensaoDemografica, grupo: string, valor: number) =>
    demografia.push({ dia: ate, dimensao, grupo, valor: Math.max(valor, 0) });

  // Ligeiramente maioritário no feminino, como é comum em contas de negócio
  // local em Portugal — mas não tanto que pareça inventado ao contrário.
  const feminino = 52 + Math.round(aleatorio() * 12);
  empurrar("genero", "F", feminino);
  empurrar("genero", "M", 100 - feminino - 3);
  empurrar("genero", "U", 3);

  const idades: [string, number][] = [
    ["13-17", 1 + aleatorio() * 2],
    ["18-24", 9 + aleatorio() * 6],
    ["25-34", 30 + aleatorio() * 10],
    ["35-44", 24 + aleatorio() * 8],
    ["45-54", 12 + aleatorio() * 6],
    ["55-64", 4 + aleatorio() * 4],
    ["65+", 1 + aleatorio() * 2],
  ];
  for (const [grupo, valor] of idades) empurrar("idade", grupo, Math.round(valor));

  const portugal = 82 + Math.round(aleatorio() * 9);
  empurrar("pais", "PT", portugal);
  empurrar("pais", "CH", Math.round((100 - portugal) * 0.3));
  empurrar("pais", "BR", Math.round((100 - portugal) * 0.25));
  empurrar("pais", "FR", Math.round((100 - portugal) * 0.2));
  empurrar("pais", "ES", Math.round((100 - portugal) * 0.15));
  empurrar("pais", "GB", Math.round((100 - portugal) * 0.1));

  let restante = 100;
  CIDADES.forEach((cidade, indice) => {
    if (restante <= 2) return;
    const fatia =
      indice === 0
        ? 38 + Math.round(aleatorio() * 12)
        : Math.round(restante * (0.18 + aleatorio() * 0.2));
    empurrar("cidade", cidade, Math.min(fatia, restante));
    restante -= fatia;
  });

  /* ----------------------------------------------------------- publicações */

  const publicacoesDemo: DadosDemonstracao["publicacoes"] = [];
  const quantas = 9;
  for (let i = 0; i < quantas; i++) {
    const dia = janela[janela.length - 1 - Math.round(aleatorio() * (dias - 1))];
    const alcance = Math.round(180 + aleatorio() * 700);
    const gostos = Math.round(alcance * (0.06 + aleatorio() * 0.08));

    publicacoesDemo.push({
      id: `demo-${i}`,
      id_externo: `demo-${i}`,
      publicado_em: `${dia}T${String(9 + Math.floor(aleatorio() * 10)).padStart(2, "0")}:30:00Z`,
      tipo: aleatorio() > 0.65 ? "reel" : aleatorio() > 0.4 ? "carrossel" : "imagem",
      // Sem URL nem miniatura de propósito: um link de demonstração que não
      // abre nada é pior do que não haver link, e uma fotografia de banco de
      // imagens faria isto passar por real.
      url: null,
      miniatura_url: null,
      legenda: LEGENDAS[i % LEGENDAS.length],
      metricas: {
        alcance,
        visualizacoes: Math.round(alcance * (1.2 + aleatorio())),
        gostos,
        comentarios: Math.round(gostos * (0.08 + aleatorio() * 0.12)),
        partilhas: Math.round(gostos * (0.05 + aleatorio() * 0.1)),
        guardados: Math.round(gostos * (0.1 + aleatorio() * 0.15)),
      },
    });
  }

  publicacoesDemo.sort((a, b) => b.publicado_em.localeCompare(a.publicado_em));

  return { metricas, demografia, publicacoes: publicacoesDemo };
}

function recuarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}
