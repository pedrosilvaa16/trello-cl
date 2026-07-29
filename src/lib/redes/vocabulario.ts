import type { RedeSocial } from "@/lib/supabase/tipos";

/**
 * O vocabulário das estatísticas.
 *
 * Cada rede fala a sua língua — a Meta chama `reach` ao que o TikTok chama
 * `video_views_total` e o LinkedIn chama `impressionCount`. Os fornecedores em
 * `src/lib/redes/` traduzem tudo para os nomes daqui, e a partir desse ponto o
 * painel nunca sabe de que rede veio o número.
 *
 * Sem este ficheiro, cada gráfico teria um `switch` por rede lá dentro e
 * acrescentar o TikTok seria mexer em todo o lado.
 *
 * Este ficheiro é lido pelo browser: só nomes e rótulos, nada de segredos.
 */

/* ------------------------------------------------------------------ redes */

export const REDES: Record<
  RedeSocial,
  {
    nome: string;
    /*
      A cor da marca, para o ponto que identifica a rede num gráfico com várias.
      Não é uma cor de interface — o resto do painel usa os tokens da casa.
      Fica aqui em hexadecimal porque é a cor de outra pessoa, não a nossa, e
      não tem lugar na paleta de `globals.css`.
    */
    cor: string;
    /**
     * O que dizer a quem repara que a rede está lá e não liga.
     *
     * Que uma rede esteja *disponível* não se decide aqui: decide-se no
     * servidor, por `Fornecedor.configurado()`, e depende só de as credenciais
     * existirem no ambiente. Assim o dia da aprovação é uma variável de
     * ambiente, e não um deploy.
     */
    porLigar: string;
  }
> = {
  instagram: {
    nome: "Instagram",
    cor: "#c13584",
    porLigar:
      "Falta a app da Meta no ambiente. Segue o guia do README, secção «Ligar as redes sociais».",
  },
  facebook: {
    nome: "Facebook",
    cor: "#1877f2",
    porLigar:
      "Falta a app da Meta no ambiente. É a mesma app do Instagram — ligar uma liga as duas.",
  },
  linkedin: {
    nome: "LinkedIn",
    cor: "#0a66c2",
    porLigar:
      "O LinkedIn exige aprovação da Community Management API, com empresa registada e Página verificada. " +
      "Assim que a aprovação chegar, basta preencher as credenciais no ambiente.",
  },
  tiktok: {
    nome: "TikTok",
    cor: "#010101",
    porLigar:
      "O TikTok precisa de uma app aprovada em developers.tiktok.com. " +
      "Assim que a aprovação chegar, basta preencher as credenciais no ambiente.",
  },
};

export const TODAS_AS_REDES = Object.keys(REDES) as RedeSocial[];

/* ---------------------------------------------------------------- métricas */

/**
 * `acumulada` ou `diaria` — a distinção que faz um painel destes estar certo.
 *
 * Uma métrica **acumulada** é um saldo: o número de seguidores no fim daquele
 * dia. O valor do período é o último; o crescimento é o último menos o
 * primeiro. Somar trinta dias de seguidores dava quinze mil seguidores a uma
 * conta que tem quinhentos.
 *
 * Uma métrica **diária** é um caudal: o alcance daquele dia. O valor do período
 * é a soma. Mostrar só o último dia dava a impressão de que o mês inteiro
 * rendeu o que rendeu uma terça-feira.
 */
export type FeitioDaMetrica = "acumulada" | "diaria";

export type DefinicaoMetrica = {
  nome: string;
  feitio: FeitioDaMetrica;
  /** Uma linha a explicar o que o número quer dizer, para o cliente. */
  ajuda: string;
};

export const METRICAS: Record<string, DefinicaoMetrica> = {
  seguidores: {
    nome: "Seguidores",
    feitio: "acumulada",
    ajuda: "Quantas pessoas seguem a conta no fim de cada dia.",
  },
  a_seguir: {
    nome: "A seguir",
    feitio: "acumulada",
    ajuda: "Quantas contas esta conta segue.",
  },
  publicacoes: {
    nome: "Publicações",
    feitio: "acumulada",
    ajuda: "Total de publicações na conta.",
  },
  alcance: {
    nome: "Alcance",
    feitio: "diaria",
    ajuda: "Quantas pessoas diferentes viram o conteúdo. Cada pessoa conta uma vez.",
  },
  visualizacoes: {
    nome: "Visualizações",
    feitio: "diaria",
    ajuda: "Quantas vezes o conteúdo foi visto. A mesma pessoa pode contar mais do que uma vez.",
  },
  interacoes: {
    nome: "Interações",
    feitio: "diaria",
    ajuda: "Gostos, comentários, partilhas e guardados somados.",
  },
  gostos: { nome: "Gostos", feitio: "diaria", ajuda: "Gostos recebidos." },
  comentarios: {
    nome: "Comentários",
    feitio: "diaria",
    ajuda: "Comentários recebidos.",
  },
  partilhas: {
    nome: "Partilhas",
    feitio: "diaria",
    ajuda: "Vezes que o conteúdo foi partilhado.",
  },
  guardados: {
    nome: "Guardados",
    feitio: "diaria",
    ajuda: "Vezes que alguém guardou o conteúdo para ver depois.",
  },
  visitas_perfil: {
    nome: "Visitas ao perfil",
    feitio: "diaria",
    ajuda: "Vezes que alguém abriu o perfil da conta.",
  },
  cliques_site: {
    nome: "Cliques no site",
    feitio: "diaria",
    ajuda: "Vezes que alguém carregou na ligação do perfil.",
  },
};

/**
 * Uma métrica que não esteja no vocabulário.
 *
 * Acontece quando a rede começa a devolver algo novo e o painel ainda não sabe
 * o que é. Devolver um nome legível em vez de rebentar é o certo: o número é
 * guardado à mesma e aparece na lista, e quem o vir decide se vale um rótulo.
 */
export function definicaoDaMetrica(chave: string): DefinicaoMetrica {
  return (
    METRICAS[chave] ?? {
      nome: chave.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
      feitio: "diaria",
      ajuda: "",
    }
  );
}

/* ------------------------------------------------------------- demografia */

/** Os rótulos dos escalões que a Meta devolve, por esta ordem. */
export const ESCALOES_IDADE = [
  "13-17",
  "18-24",
  "25-34",
  "35-44",
  "45-54",
  "55-64",
  "65+",
];

/**
 * A Meta manda `M`, `F` e `U`. `U` é "não declarado", e não "outro" — dizer
 * "outro" seria pôr na boca das pessoas uma coisa que elas não disseram.
 */
export const GENEROS: Record<string, string> = {
  M: "Masculino",
  F: "Feminino",
  U: "Não declarado",
};

/**
 * Os países vêm em ISO 3166-1 alfa-2. `Intl.DisplayNames` traduz para
 * português sem tabela nenhuma da nossa parte, e sabe mais códigos do que
 * qualquer lista que aqui se escrevesse à mão.
 */
export function nomeDoPais(codigo: string): string {
  try {
    return (
      new Intl.DisplayNames(["pt-PT"], { type: "region" }).of(codigo) ?? codigo
    );
  } catch {
    return codigo;
  }
}
