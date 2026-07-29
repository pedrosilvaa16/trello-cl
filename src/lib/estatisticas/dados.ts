import "server-only";

import { carregarCabecalhoQuadro } from "@/lib/quadro/dados";
import { redesConfiguradas } from "@/lib/redes/fornecedores";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type {
  DimensaoDemografica,
  LigacaoRede,
  PapelQuadro,
  Quadro,
  RedeSocial,
} from "@/lib/supabase/tipos";

import {
  janelas,
  paraDia,
  type LinhaDeMetrica,
  type Periodo,
} from "./agregar";
import { dadosDeDemonstracao } from "./demonstracao";

/** Uma publicação, já pronta para a grelha. */
export type PublicacaoNoPainel = {
  id: string;
  rede: RedeSocial | null;
  publicado_em: string;
  tipo: string | null;
  url: string | null;
  miniatura_url: string | null;
  legenda: string | null;
  metricas: Record<string, number>;
};

export type DadosEstatisticas = {
  quadro: Quadro;
  papel: PapelQuadro;
  ligacoes: LigacaoRede[];
  metricas: LinhaDeMetrica[];
  demografia: {
    dia: string;
    dimensao: DimensaoDemografica;
    grupo: string;
    valor: number;
  }[];
  publicacoes: PublicacaoNoPainel[];
  /** As redes que este servidor sabe ligar. As outras aparecem a explicar-se. */
  configuradas: RedeSocial[];
  /**
   * Verdadeiro quando os números são inventados.
   *
   * Nunca é uma decisão do componente: vem daqui, e a página inteira muda de
   * aspeto por causa dele. Um número inventado sem esta marca por cima é uma
   * mentira a um cliente — ver `demonstracao.ts`.
   */
  demonstracao: boolean;
  /** O dia a partir do qual há histórico a sério. Nulo em demonstração. */
  primeiroDia: string | null;
};

/**
 * Tudo o que o painel de estatísticas precisa.
 *
 * Devolve `null` quando o quadro não existe ou não é nosso — igual ao resto do
 * produto, e pela mesma razão: RLS faz o quadro alheio desaparecer, não dá erro
 * de permissão.
 *
 * A leitura é toda pelo cliente do utilizador, e portanto toda pelo RLS. As
 * políticas destas tabelas delegam em `pode_aceder_quadro`, o que quer dizer que
 * um comentador — o cliente — vê o painel completo, e é isso que se quer.
 */
export async function carregarEstatisticas(
  idQuadro: string,
  periodo: Periodo,
  rede?: RedeSocial,
): Promise<DadosEstatisticas | null> {
  const cabecalho = await carregarCabecalhoQuadro(idQuadro);
  if (!cabecalho) return null;

  const supabase = await criarClienteServidor();
  const hoje = paraDia(new Date());
  const { atual, anterior } = janelas(hoje, periodo);

  const { data: ligacoesBrutas } = await supabase
    .from("ligacoes_redes")
    .select("*")
    .eq("board_id", idQuadro)
    .order("rede");

  const ligacoes = (ligacoesBrutas ?? []) as LigacaoRede[];
  const configuradas = redesConfiguradas();

  /*
    Sem ligação nenhuma, o painel enche-se de demonstração.

    A alternativa era um ecrã vazio, e um ecrã vazio diz ao cliente que a
    ferramenta não faz nada. O que ele vê em vez disso é a forma exata do painel
    que vai ter, com a marca de exemplo por cima e a explicação por baixo.
  */
  if (ligacoes.length === 0) {
    const demo = dadosDeDemonstracao(idQuadro, hoje, periodo.dias);
    return {
      quadro: cabecalho.quadro,
      papel: cabecalho.papel,
      ligacoes: [],
      metricas: demo.metricas,
      demografia: demo.demografia,
      publicacoes: demo.publicacoes.map((p) => ({ ...p, rede: null })),
      configuradas,
      demonstracao: true,
      primeiroDia: null,
    };
  }

  /*
    A janela lida vai desde o início do período ANTERIOR: é o que permite
    comparar sem uma segunda ida ao servidor, e são umas centenas de linhas.
  */
  const [{ data: metricas }, { data: demografia }, { data: publicacoes }] =
    await Promise.all([
      supabase
        .from("metricas_redes")
        .select("dia, metrica, valor, rede")
        .eq("board_id", idQuadro)
        .gte("dia", anterior.de)
        .lte("dia", atual.ate)
        .order("dia"),
      supabase
        .from("demografia_redes")
        .select("dia, dimensao, grupo, valor, rede")
        .eq("board_id", idQuadro)
        .order("dia", { ascending: false })
        .limit(400),
      supabase
        .from("publicacoes_redes")
        .select("id, rede, publicado_em, tipo, url, miniatura_url, legenda, metricas")
        .eq("board_id", idQuadro)
        .gte("publicado_em", `${atual.de}T00:00:00Z`)
        .order("publicado_em", { ascending: false })
        .limit(60),
    ]);

  /*
    O filtro por rede é feito aqui e não na consulta porque o painel troca de
    separador sem recarregar a página quando pode — e porque as três consultas
    já vêm limitadas pelo quadro e pela janela, que é o que corta o volume.
  */
  const daRede = <T extends { rede?: RedeSocial | null }>(linhas: T[] | null) =>
    (linhas ?? []).filter((linha) => !rede || linha.rede === rede);

  const primeiroDia = ligacoes
    .map((ligacao) => ligacao.primeiro_dia)
    .filter((dia): dia is string => Boolean(dia))
    .sort()
    .at(0) ?? null;

  return {
    quadro: cabecalho.quadro,
    papel: cabecalho.papel,
    ligacoes,
    metricas: daRede(metricas).map((linha) => ({
      dia: linha.dia,
      metrica: linha.metrica,
      valor: Number(linha.valor),
    })),
    demografia: daRede(demografia).map((linha) => ({
      dia: linha.dia,
      dimensao: linha.dimensao,
      grupo: linha.grupo,
      valor: Number(linha.valor),
    })),
    publicacoes: daRede(publicacoes).map((linha) => ({
      id: linha.id,
      rede: linha.rede,
      publicado_em: linha.publicado_em,
      tipo: linha.tipo,
      url: linha.url,
      miniatura_url: linha.miniatura_url,
      legenda: linha.legenda,
      metricas: (linha.metricas ?? {}) as Record<string, number>,
    })),
    configuradas,
    demonstracao: false,
    primeiroDia,
  };
}
