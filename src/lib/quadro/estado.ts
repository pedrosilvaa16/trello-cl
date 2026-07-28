import { porPosicao } from "../posicoes";
import type { Cartao, Etiqueta, Lista, Quadro } from "../supabase/tipos";
import type { CartaoCompleto, DadosQuadro, MembroComPerfil } from "./tipos";

export type EstadoQuadro = {
  quadro: Quadro;
  listas: Lista[];
  cartoes: CartaoCompleto[];
  etiquetas: Etiqueta[];
  membros: MembroComPerfil[];
};

export type AccaoQuadro =
  | { tipo: "quadro:alterar"; campos: Partial<Quadro> }
  | { tipo: "lista:upsert"; lista: Lista }
  | { tipo: "lista:alterar"; id: string; campos: Partial<Lista> }
  | { tipo: "lista:remover"; id: string }
  | { tipo: "cartao:upsert"; cartao: Cartao }
  | { tipo: "cartao:inserir"; cartao: CartaoCompleto }
  | { tipo: "cartao:alterar"; id: string; campos: Partial<CartaoCompleto> }
  | { tipo: "cartao:remover"; id: string }
  | {
      tipo: "cartoes:reposicionar";
      posicoes: { id: string; list_id: string; posicao: number }[];
    }
  | { tipo: "etiqueta:upsert"; etiqueta: Etiqueta }
  | { tipo: "etiqueta:remover"; id: string }
  | { tipo: "cartao:etiqueta"; cartao: string; etiqueta: string; ligar: boolean }
  | { tipo: "cartao:membro"; cartao: string; utilizador: string; ligar: boolean }
  | { tipo: "membro:upsert"; membro: MembroComPerfil }
  | { tipo: "membro:remover"; utilizador: string };

export function estadoInicial(dados: DadosQuadro): EstadoQuadro {
  return {
    quadro: dados.quadro,
    listas: dados.listas,
    cartoes: dados.cartoes,
    etiquetas: dados.etiquetas,
    membros: dados.membros,
  };
}

/**
 * Reducer do quadro.
 *
 * Três coisas escrevem aqui: o arrasto (otimista, antes da rede), as ações do
 * utilizador e o Realtime. Por isso todas as operações são idempotentes e
 * fazem merge em vez de substituir — a mesma alteração pode chegar duas vezes,
 * uma pela resposta e outra pelo canal, e o resultado tem de ser o mesmo.
 */
export function reduzir(
  estado: EstadoQuadro,
  accao: AccaoQuadro,
): EstadoQuadro {
  switch (accao.tipo) {
    case "quadro:alterar":
      return { ...estado, quadro: { ...estado.quadro, ...accao.campos } };

    case "lista:upsert": {
      const existe = estado.listas.some((l) => l.id === accao.lista.id);
      const listas = existe
        ? estado.listas.map((l) => (l.id === accao.lista.id ? accao.lista : l))
        : [...estado.listas, accao.lista];
      return { ...estado, listas: listas.sort(porPosicao) };
    }

    case "lista:alterar":
      return {
        ...estado,
        listas: estado.listas
          .map((l) => (l.id === accao.id ? { ...l, ...accao.campos } : l))
          .sort(porPosicao),
      };

    case "lista:remover":
      return {
        ...estado,
        listas: estado.listas.filter((l) => l.id !== accao.id),
        // Os cartões da lista vão com ela: no servidor é o ON DELETE CASCADE
        // que trata disto, e o canal do Realtime não emite um evento por cada.
        cartoes: estado.cartoes.filter((c) => c.list_id !== accao.id),
      };

    case "cartao:upsert": {
      // Um cartão de outro quadro do mesmo utilizador também chega ao canal do
      // Realtime, porque `cards` não tem board_id para filtrar na subscrição.
      // Descarta-se aqui, que é onde se sabe que listas é que este quadro tem.
      const daqui = estado.listas.some((l) => l.id === accao.cartao.list_id);
      if (!daqui) return estado;

      const anterior = estado.cartoes.find((c) => c.id === accao.cartao.id);
      // Do Realtime vem a linha crua: as ligações que já temos em memória
      // continuam válidas e não podem ser deitadas fora.
      const completo: CartaoCompleto = {
        ...accao.cartao,
        etiquetas: anterior?.etiquetas ?? [],
        membros: anterior?.membros ?? [],
        nComentarios: anterior?.nComentarios ?? 0,
        nAnexos: anterior?.nAnexos ?? 0,
      };
      const cartoes = anterior
        ? estado.cartoes.map((c) => (c.id === completo.id ? completo : c))
        : [...estado.cartoes, completo];
      return { ...estado, cartoes: cartoes.sort(porPosicao) };
    }

    case "cartao:inserir":
      return {
        ...estado,
        cartoes: [...estado.cartoes, accao.cartao].sort(porPosicao),
      };

    case "cartao:alterar":
      return {
        ...estado,
        cartoes: estado.cartoes
          .map((c) => (c.id === accao.id ? { ...c, ...accao.campos } : c))
          .sort(porPosicao),
      };

    case "cartao:remover":
      return {
        ...estado,
        cartoes: estado.cartoes.filter((c) => c.id !== accao.id),
      };

    // Depois de o servidor reequilibrar uma lista. Aplica-se por cima do estado
    // que existir no momento, e não de um instantâneo tirado antes da ida à
    // rede — pelo meio pode ter chegado uma alteração de outra pessoa.
    case "cartoes:reposicionar": {
      const novas = new Map(accao.posicoes.map((p) => [p.id, p]));
      return {
        ...estado,
        cartoes: estado.cartoes
          .map((cartao) => {
            const nova = novas.get(cartao.id);
            return nova
              ? { ...cartao, list_id: nova.list_id, posicao: nova.posicao }
              : cartao;
          })
          .sort(porPosicao),
      };
    }

    case "etiqueta:upsert": {
      const existe = estado.etiquetas.some((e) => e.id === accao.etiqueta.id);
      return {
        ...estado,
        etiquetas: existe
          ? estado.etiquetas.map((e) =>
              e.id === accao.etiqueta.id ? accao.etiqueta : e,
            )
          : [...estado.etiquetas, accao.etiqueta],
      };
    }

    case "etiqueta:remover":
      return {
        ...estado,
        etiquetas: estado.etiquetas.filter((e) => e.id !== accao.id),
        cartoes: estado.cartoes.map((c) =>
          c.etiquetas.includes(accao.id)
            ? { ...c, etiquetas: c.etiquetas.filter((id) => id !== accao.id) }
            : c,
        ),
      };

    case "cartao:etiqueta":
      return {
        ...estado,
        cartoes: estado.cartoes.map((c) =>
          c.id !== accao.cartao
            ? c
            : {
                ...c,
                etiquetas: accao.ligar
                  ? c.etiquetas.includes(accao.etiqueta)
                    ? c.etiquetas
                    : [...c.etiquetas, accao.etiqueta]
                  : c.etiquetas.filter((id) => id !== accao.etiqueta),
              },
        ),
      };

    case "cartao:membro":
      return {
        ...estado,
        cartoes: estado.cartoes.map((c) =>
          c.id !== accao.cartao
            ? c
            : {
                ...c,
                membros: accao.ligar
                  ? c.membros.includes(accao.utilizador)
                    ? c.membros
                    : [...c.membros, accao.utilizador]
                  : c.membros.filter((id) => id !== accao.utilizador),
              },
        ),
      };

    case "membro:upsert": {
      const existe = estado.membros.some(
        (m) => m.user_id === accao.membro.user_id,
      );
      return {
        ...estado,
        membros: existe
          ? estado.membros.map((m) =>
              m.user_id === accao.membro.user_id ? accao.membro : m,
            )
          : [...estado.membros, accao.membro],
      };
    }

    case "membro:remover":
      return {
        ...estado,
        membros: estado.membros.filter((m) => m.user_id !== accao.utilizador),
        cartoes: estado.cartoes.map((c) =>
          c.membros.includes(accao.utilizador)
            ? { ...c, membros: c.membros.filter((id) => id !== accao.utilizador) }
            : c,
        ),
      };
  }
}
