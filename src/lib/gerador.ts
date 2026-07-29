import "server-only";

import type { ContextoMontado, TipoTarefa } from "./contexto";
import { criarClienteServidor } from "./supabase/servidor";

/**
 * A camada de geração, atrás de uma interface.
 *
 * NESTA FASE NÃO HÁ MODELO NENHUM LIGADO. Não há chave de API, não há SDK
 * instalado, não sai nenhum pedido desta máquina. O que existe é o sítio onde o
 * modelo entrará, e um simulado que se comporta como ele se comportará — para
 * a interface, a persistência e o formato das respostas estarem testados antes
 * de se gastar dinheiro a descobrir que estavam errados.
 *
 * O simulado grava em `geracoes` exatamente como o real gravará, incluindo o
 * retrato do contexto e o respetivo hash. No dia em que o `GeradorReal` for
 * escrito, a única coisa que muda é de onde vem o texto da resposta.
 */

export type Resultado = {
  resposta: string;
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** O id da linha gravada em `geracoes`. */
  geracaoId: string | null;
};

export interface Gerador {
  gerar(
    contexto: ContextoMontado,
    pedido: string,
    opcoes: { boardId: string; tarefa: TipoTarefa; cardId?: string | null },
  ): Promise<Resultado>;
}

/* ------------------------------------------------------------- simulado -- */

/**
 * Respostas fixas, com atraso artificial.
 *
 * O atraso não é teatro: uma interface que responde num milissegundo esconde
 * exatamente os problemas que aparecem quando a resposta demora — o botão que
 * se pode carregar duas vezes, o estado que não bloqueia, o painel que salta.
 * 800 a 1500 ms é a ordem de grandeza do que um modelo demora a começar.
 */
export class GeradorSimulado implements Gerador {
  async gerar(
    contexto: ContextoMontado,
    pedido: string,
    opcoes: { boardId: string; tarefa: TipoTarefa; cardId?: string | null },
  ): Promise<Resultado> {
    await new Promise((resolver) =>
      setTimeout(resolver, 800 + Math.floor(Math.random() * 700)),
    );

    const resposta = RESPOSTAS[opcoes.tarefa](contexto);

    return {
      resposta,
      modelo: "simulado",
      tokensEntrada: contexto.estatisticas.tokensEstimados,
      tokensSaida: Math.ceil(resposta.length / 4),
      geracaoId: await registar(contexto, pedido, resposta, opcoes),
    };
  }
}

/*
  As respostas mencionam o que o contexto tem e o que lhe falta, de propósito.
  Uma resposta fixa que ignorasse a entrada deixaria passar despercebido o caso
  que mais interessa apanhar agora: o contexto estar vazio e ninguém reparar.
*/
const RESPOSTAS: Record<TipoTarefa, (c: ContextoMontado) => string> = {
  ideias: (c) =>
    [
      "*(resposta simulada — nenhum modelo foi consultado)*",
      "",
      "**1. Série «Antes e depois»** — três publicações a mostrar o mesmo",
      "problema resolvido de maneiras diferentes.",
      "",
      "**2. Bastidores de um projeto** — vídeo curto, sem locução, com texto",
      "por cima.",
      "",
      "**3. Resposta a uma dúvida frequente** — a que aparece nos comentários.",
      "",
      diagnosticoCurto(c),
    ].join("\n"),

  legenda: () =>
    [
      "*(resposta simulada — nenhum modelo foi consultado)*",
      "",
      "Há coisas que só se percebem quando se veem ao lado umas das outras.",
      "Esta é uma delas.",
      "",
      "Conta-nos nos comentários o que farias diferente.",
    ].join("\n"),

  guiao: () =>
    [
      "*(resposta simulada — nenhum modelo foi consultado)*",
      "",
      "**0–3 s** — plano fechado no detalhe. Texto: «ninguém repara nisto».",
      "**3–10 s** — abre o plano, mostra o conjunto.",
      "**10–18 s** — a explicação, em duas frases.",
      "**18–22 s** — remate e chamada à ação.",
    ].join("\n"),

  voz_marca: (c) =>
    [
      "*(proposta simulada — nenhum modelo foi consultado)*",
      "",
      "**Tom.** Direto e sem floreados. Frases curtas. Trata por tu.",
      "",
      "**Vocabulário.** Concreto, do dia a dia do cliente. Evita jargão de",
      "agência («sinergia», «disrupção», «solução 360»).",
      "",
      "**Ritmo.** Uma ideia por publicação. O primeiro parágrafo diz tudo; o",
      "resto é para quem quiser ficar.",
      "",
      "**O que nunca faz.** Promessas absolutas, superlativos vazios,",
      "exclamações a dobrar.",
      "",
      c.estatisticas.totalPublicados === 0
        ? "> Atenção: não há publicações registadas neste quadro, por isso esta " +
          "proposta não foi construída a partir de nada. Marca a lista dos " +
          "publicados no separador e volta a pedir."
        : `> Construída a partir de ${c.estatisticas.totalPublicados} publicações registadas. ` +
          "Corrige o que não soar a esta marca — corrigir é mais rápido do que escrever de raiz.",
    ].join("\n"),

  diagnostico: (c) => diagnosticoCurto(c),
};

function diagnosticoCurto(c: ContextoMontado) {
  const faltas: string[] = [];
  if (!c.estatisticas.temEstrategia) faltas.push("a estratégia está por escrever");
  if (!c.estatisticas.temVozMarca) faltas.push("a voz da marca está por escrever");
  if (c.estatisticas.totalPublicados === 0)
    faltas.push("não há nenhuma lista marcada como «publicados»");
  if (c.estatisticas.totalReferencias === 0)
    faltas.push("não há nenhuma lista marcada como «referências»");

  const semPorque =
    c.estatisticas.totalReferencias - c.estatisticas.referenciasComPorque;
  if (semPorque > 0)
    faltas.push(
      `${semPorque} ${semPorque === 1 ? "referência não tem" : "referências não têm"} o porquê preenchido`,
    );
  if (c.estatisticas.totalAprendizagens === 0)
    faltas.push("não há aprendizagens registadas");

  if (faltas.length === 0) {
    return "> O contexto está completo. Estratégia, voz, publicados, referências com porquê e aprendizagens — está tudo preenchido.";
  }
  return `> **O que falta neste contexto:** ${faltas.join("; ")}.`;
}

/* ----------------------------------------------------------------- real -- */

/**
 * O sítio do modelo a sério. Não implementar nesta fase.
 *
 * Quando chegar a altura, o que muda é só o corpo de `gerar`: pedir a resposta
 * ao modelo em vez de a ir buscar a uma tabela, e devolver os tokens reais em
 * vez dos estimados. O registo em `geracoes` já está escrito e já foi testado.
 */
export class GeradorReal implements Gerador {
  async gerar(): Promise<Resultado> {
    throw new Error(
      "O gerador real ainda não está implementado. Esta fase corre com GERADOR=simulado.",
    );
  }
}

export function obterGerador(): Gerador {
  return process.env.GERADOR === "real" ? new GeradorReal() : new GeradorSimulado();
}

/* ------------------------------------------------------------- registo -- */

/**
 * Grava a geração, com o retrato do contexto que a produziu.
 *
 * O snapshot é o que foi enviado, e não uma referência ao que existia: o
 * contexto muda todos os dias, e uma resposta má só se explica olhando para a
 * entrada exata que a gerou. É a diferença entre poder investigar e ter de
 * adivinhar.
 *
 * Falhar a gravar não deita fora a resposta — quem pediu já a tem no ecrã, e
 * perder o registo é menos mau do que perder o trabalho.
 */
async function registar(
  contexto: ContextoMontado,
  pedido: string,
  resposta: string,
  opcoes: { boardId: string; tarefa: TipoTarefa; cardId?: string | null },
): Promise<string | null> {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("geracoes")
    .insert({
      board_id: opcoes.boardId,
      card_id: opcoes.cardId ?? null,
      tarefa: opcoes.tarefa,
      contexto_snapshot: {
        blocos: contexto.blocos,
        estatisticas: contexto.estatisticas,
        texto: contexto.texto,
      },
      contexto_hash: contexto.hash,
      pedido,
      resposta,
      modelo: "simulado",
      tokens_entrada: contexto.estatisticas.tokensEstimados,
      tokens_saida: Math.ceil(resposta.length / 4),
      criado_por: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Não foi possível registar a geração:", error);
    return null;
  }
  return data.id;
}
