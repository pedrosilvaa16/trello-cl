import { definicaoDaMetrica, type FeitioDaMetrica } from "@/lib/redes/vocabulario";

/**
 * A aritmética do painel.
 *
 * Funções puras, sem base de dados e sem React, porque é aqui que os números
 * ou estão certos ou não estão — e um número errado num painel que se mostra a
 * um cliente custa mais do que um ecrã feio. Tudo o que está aqui tem teste em
 * `agregar.test.ts`.
 *
 * A regra que manda em tudo é a distinção entre métricas **acumuladas** e
 * **diárias** (ver `src/lib/redes/vocabulario.ts`). Somar seguidores ao longo
 * de trinta dias dá quinze mil seguidores a uma conta que tem quinhentos;
 * mostrar só o último dia de alcance dá a impressão de que o mês rendeu o que
 * rendeu uma terça-feira. As duas contas são diferentes e nenhuma serve para a
 * outra.
 */

export type Ponto = { dia: string; valor: number };

export type LinhaDeMetrica = { dia: string; metrica: string; valor: number };

/* -------------------------------------------------------------- períodos */

export type Periodo = {
  chave: string;
  nome: string;
  /** Curto para o eixo do gráfico no telemóvel, onde não cabe o nome todo. */
  curto: string;
  dias: number;
};

export const PERIODOS: Periodo[] = [
  { chave: "7", nome: "Últimos 7 dias", curto: "7 dias", dias: 7 },
  { chave: "30", nome: "Últimos 30 dias", curto: "30 dias", dias: 30 },
  { chave: "90", nome: "Últimos 90 dias", curto: "90 dias", dias: 90 },
  { chave: "365", nome: "Último ano", curto: "1 ano", dias: 365 },
];

export const PERIODO_POR_OMISSAO = PERIODOS[1];

export function periodoPorChave(chave: string | undefined): Periodo {
  return PERIODOS.find((p) => p.chave === chave) ?? PERIODO_POR_OMISSAO;
}

/** Data ISO `AAAA-MM-DD`, sempre em UTC, como a coluna `dia` da base de dados. */
export function paraDia(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function recuar(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return paraDia(d);
}

/**
 * A janela do período, e a janela imediatamente anterior.
 *
 * A segunda é o que dá sentido ao "+12% face ao período anterior". Tem de ter
 * exatamente o mesmo comprimento — comparar trinta dias com vinte e oito daria
 * uma quebra de 7% que só existe no calendário.
 */
export function janelas(ate: string, periodo: Periodo) {
  const inicio = recuar(ate, periodo.dias - 1);
  return {
    atual: { de: inicio, ate },
    anterior: { de: recuar(inicio, periodo.dias), ate: recuar(inicio, 1) },
  };
}

/** Todos os dias de uma janela, inclusive. */
export function diasDaJanela(de: string, ate: string): string[] {
  const dias: string[] = [];
  const cursor = new Date(`${de}T00:00:00Z`);
  const fim = new Date(`${ate}T00:00:00Z`).getTime();

  while (cursor.getTime() <= fim) {
    dias.push(paraDia(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    // Uma janela ao contrário devolveria vazio; mil dias é o tecto de segurança
    // contra um período absurdo vindo da barra de endereços.
    if (dias.length > 1000) break;
  }
  return dias;
}

/* ----------------------------------------------------------------- séries */

/**
 * A série de uma métrica, com um ponto por dia da janela.
 *
 * Os buracos são preenchidos, e o modo depende do feitio:
 *
 * · **acumulada** — repete-se o último valor conhecido. Um dia em que a
 *   sincronização falhou não significa que a conta ficou com zero seguidores, e
 *   um gráfico que caísse a pique nesse dia era uma mentira alarmante.
 * · **diária** — zero. Um dia sem alcance registado é um dia sem alcance
 *   registado, e arrastar o valor da véspera inventava tráfego que não houve.
 *
 * Antes do primeiro valor conhecido, a acumulada também fica a zero: não há
 * nada que arrastar para trás, e inventar seria pior do que não mostrar.
 */
export function serie(
  linhas: LinhaDeMetrica[],
  metrica: string,
  de: string,
  ate: string,
  feitio: FeitioDaMetrica = definicaoDaMetrica(metrica).feitio,
): Ponto[] {
  const porDia = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.metrica !== metrica) continue;
    porDia.set(linha.dia, Number(linha.valor));
  }

  let ultimo = 0;
  return diasDaJanela(de, ate).map((dia) => {
    const valor = porDia.get(dia);
    if (valor !== undefined) {
      ultimo = valor;
      return { dia, valor };
    }
    return { dia, valor: feitio === "acumulada" ? ultimo : 0 };
  });
}

/**
 * O número que se põe no cartão grande.
 *
 * Acumulada: o valor no fim do período — quantos seguidores há *agora*.
 * Diária: a soma do período — quanto alcance houve *no total*.
 */
export function totalDoPeriodo(pontos: Ponto[], feitio: FeitioDaMetrica): number {
  if (pontos.length === 0) return 0;
  if (feitio === "acumulada") return pontos[pontos.length - 1].valor;
  return pontos.reduce((soma, ponto) => soma + ponto.valor, 0);
}

/**
 * Quanto é que uma métrica acumulada cresceu no período.
 *
 * O primeiro ponto é o saldo com que se entrou no período, não um ganho — por
 * isso a conta é último menos primeiro. Uma conta que passou de 500 para 523
 * ganhou 23 seguidores, e não 523.
 */
export function crescimento(pontos: Ponto[]): number {
  if (pontos.length < 2) return 0;
  return pontos[pontos.length - 1].valor - pontos[0].valor;
}

/**
 * A variação face ao período anterior, em percentagem.
 *
 * Devolve `null` quando o período anterior é zero — e não infinito, nem 100%.
 * Crescer de 0 para 40 não é "mais 100%", é uma conta que não tinha história;
 * o painel mostra o número absoluto e cala a percentagem, que é o honesto.
 */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

/* --------------------------------------------------------------- resumos */

export type ResumoMetrica = {
  metrica: string;
  nome: string;
  feitio: FeitioDaMetrica;
  valor: number;
  /** Só para acumuladas: quanto subiu ou desceu dentro do período. */
  crescimento: number | null;
  /** Percentagem face ao período anterior, ou `null` se não houver com quê. */
  variacao: number | null;
  serie: Ponto[];
  ajuda: string;
};

/** Prepara uma métrica para o cartão de topo, com série e comparação. */
export function resumir(
  linhas: LinhaDeMetrica[],
  metrica: string,
  atual: { de: string; ate: string },
  anterior: { de: string; ate: string },
): ResumoMetrica {
  const definicao = definicaoDaMetrica(metrica);
  const pontos = serie(linhas, metrica, atual.de, atual.ate, definicao.feitio);
  const pontosAnteriores = serie(
    linhas,
    metrica,
    anterior.de,
    anterior.ate,
    definicao.feitio,
  );

  const valor = totalDoPeriodo(pontos, definicao.feitio);

  /*
    Para uma métrica acumulada, comparar o saldo de hoje com o de há trinta dias
    dava sempre uma percentagem minúscula — 523 contra 500 são "mais 4,6%", o
    que não diz nada a ninguém. O que interessa comparar é o CRESCIMENTO deste
    período com o do anterior: 23 seguidores contra 8 é uma notícia.
  */
  const cresceu = definicao.feitio === "acumulada" ? crescimento(pontos) : null;
  const comparavel =
    definicao.feitio === "acumulada"
      ? crescimento(pontosAnteriores)
      : totalDoPeriodo(pontosAnteriores, definicao.feitio);

  return {
    metrica,
    nome: definicao.nome,
    feitio: definicao.feitio,
    valor,
    crescimento: cresceu,
    variacao: variacao(cresceu ?? valor, comparavel),
    serie: pontos,
    ajuda: definicao.ajuda,
  };
}

/* ------------------------------------------------------------ demografia */

export type FatiaDemografica = {
  grupo: string;
  valor: number;
  /** Fração de 0 a 1. É o que os anéis e as barras desenham. */
  fracao: number;
};

/**
 * Uma distribuição, normalizada e ordenada.
 *
 * A Meta devolve umas dimensões em percentagem e outras em contagem absoluta, e
 * às vezes muda de ideias entre versões. Normalizar aqui — sempre fração do
 * total — faz o gráfico ser sempre o mesmo gráfico, venha o que vier.
 *
 * `ordem` fixa a sequência quando ela tem significado (os escalões etários lêem-
 * -se do mais novo para o mais velho, não do maior para o menor). Sem `ordem`,
 * ordena-se por valor, que é o certo para países e cidades.
 */
export function distribuicao(
  linhas: { dimensao: string; grupo: string; valor: number; dia: string }[],
  dimensao: string,
  opcoes: { ordem?: string[]; maximo?: number } = {},
): FatiaDemografica[] {
  const daDimensao = linhas.filter((l) => l.dimensao === dimensao);
  if (daDimensao.length === 0) return [];

  /*
    Só o retrato mais recente. A demografia é guardada com o dia em que foi
    lida, e juntar dois retratos somaria o mesmo público duas vezes.
  */
  const maisRecente = daDimensao.reduce(
    (maximo, linha) => (linha.dia > maximo ? linha.dia : maximo),
    daDimensao[0].dia,
  );

  const doDia = daDimensao.filter((l) => l.dia === maisRecente);
  const total = doDia.reduce((soma, l) => soma + Number(l.valor), 0);
  if (total <= 0) return [];

  const fatias = doDia.map((l) => ({
    grupo: l.grupo,
    valor: Number(l.valor),
    fracao: Number(l.valor) / total,
  }));

  if (opcoes.ordem) {
    const posicao = (grupo: string) => {
      const i = opcoes.ordem!.indexOf(grupo);
      // O que não está na ordem conhecida vai para o fim, sem desaparecer.
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    fatias.sort((a, b) => posicao(a.grupo) - posicao(b.grupo));
  } else {
    fatias.sort((a, b) => b.valor - a.valor);
  }

  if (opcoes.maximo && fatias.length > opcoes.maximo) {
    const visiveis = fatias.slice(0, opcoes.maximo);
    const resto = fatias.slice(opcoes.maximo);
    /*
      O resto vira uma fatia "Outros" em vez de desaparecer. Um anel cujas
      fatias não somam o todo é um gráfico que mente por omissão.
    */
    visiveis.push({
      grupo: "Outros",
      valor: resto.reduce((soma, f) => soma + f.valor, 0),
      fracao: resto.reduce((soma, f) => soma + f.fracao, 0),
    });
    return visiveis;
  }

  return fatias;
}

/* ------------------------------------------------------------- formatação */

/**
 * Números grandes, curtos.
 *
 * Num cartão de telemóvel não cabe "1 234 567", e um número que quebra a linha
 * lê-se pior do que um arredondado. Abaixo de dez mil mostra-se por extenso,
 * porque aí a precisão ainda importa a quem olha.
 */
export function abreviar(valor: number): string {
  const absoluto = Math.abs(valor);
  if (absoluto < 10_000) return new Intl.NumberFormat("pt-PT").format(Math.round(valor));
  if (absoluto < 1_000_000) {
    return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(valor / 1000)} mil`;
  }
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 }).format(valor / 1_000_000)}M`;
}

export function porExtenso(valor: number): string {
  return new Intl.NumberFormat("pt-PT").format(Math.round(valor));
}

/** Com sinal à frente: num painel de resultados, o `+` é metade da informação. */
export function comSinal(valor: number): string {
  const formatado = new Intl.NumberFormat("pt-PT").format(Math.round(valor));
  return valor > 0 ? `+${formatado}` : formatado;
}

export function percentagem(valor: number, casas = 1): string {
  return `${new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  }).format(valor)}%`;
}
