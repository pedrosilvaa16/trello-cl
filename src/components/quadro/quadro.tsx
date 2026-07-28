"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { posicaoNoIndice, porPosicao } from "@/lib/posicoes";
import { estadoInicial, reduzir } from "@/lib/quadro/estado";
import { aplicarFiltros, FILTROS_VAZIOS, type Filtros } from "@/lib/quadro/filtros";
import * as mutar from "@/lib/quadro/mutacoes";
import { useTempoReal } from "@/lib/quadro/tempo-real";
import { podeEditar, type CartaoCompleto, type DadosQuadro } from "@/lib/quadro/tipos";
import type { Perfil } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

import { ID_CAMPO_PESQUISA } from "./filtros";
import { BarraQuadro } from "./barra-quadro";
import { CartaoMini } from "./cartao-mini";
import { Coluna, ID_BOTAO_NOVA_LISTA, NovaColuna } from "./coluna";
import { DetalheCartao } from "./detalhe-cartao";
import { useAtalhos } from "./atalhos";

type Arrasto = {
  id: string;
  tipo: "cartao" | "lista";
  /** Onde estava quando o arrasto começou, para poder voltar atrás. */
  origem: { list_id: string; posicao: number } | null;
};

export function Quadro({
  dados,
  utilizador,
}: {
  dados: DadosQuadro;
  utilizador: Perfil;
}) {
  const [estado, despachar] = React.useReducer(reduzir, dados, estadoInicial);

  useTempoReal(dados.quadro.id, despachar);

  const [filtros, definirFiltros] = React.useState<Filtros>(FILTROS_VAZIOS);
  const [cartaoAberto, definirCartaoAberto] = React.useState<string | null>(null);
  const [arrasto, definirArrasto] = React.useState<Arrasto | null>(null);

  const editavel = podeEditar(dados.papel);

  const listas = React.useMemo(
    () => estado.listas.filter((l) => !l.arquivada).slice().sort(porPosicao),
    [estado.listas],
  );

  /*
    Os cartões visíveis, por lista. Com filtros ativos, as posições usadas no
    arrasto saem daqui — largar entre dois cartões que se veem dá a posição
    certa em relação a eles, que é o que o utilizador está a pedir.
  */
  const cartoesPorLista = React.useMemo(() => {
    const visiveis = aplicarFiltros(
      estado.cartoes.filter((c) => !c.arquivado),
      filtros,
    );
    const mapa = new Map<string, CartaoCompleto[]>();
    for (const lista of listas) mapa.set(lista.id, []);
    for (const cartao of visiveis.slice().sort(porPosicao)) {
      mapa.get(cartao.list_id)?.push(cartao);
    }
    return mapa;
  }, [estado.cartoes, filtros, listas]);

  const sensores = useSensors(
    // 4px de folga: um clique para abrir o cartão não pode virar arrasto.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // No telemóvel é o toque longo que arrasta — senão não se conseguia rolar.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /* ------------------------------------------------------------ arrasto -- */

  /**
   * Onde é que o item vai parar.
   *
   * `over` tanto pode ser um cartão como uma coluna — largar numa coluna vazia
   * dá o id da coluna. Os dois casos resolvem-se para lista + índice.
   */
  function destinoDe(idAtivo: string, idSobre: string) {
    const coluna = estado.listas.find((l) => l.id === idSobre);
    if (coluna) {
      const vizinhos = (cartoesPorLista.get(coluna.id) ?? []).filter(
        (c) => c.id !== idAtivo,
      );
      return { listaId: coluna.id, indice: vizinhos.length, vizinhos };
    }

    const alvo = estado.cartoes.find((c) => c.id === idSobre);
    if (!alvo) return null;

    const vizinhos = (cartoesPorLista.get(alvo.list_id) ?? []).filter(
      (c) => c.id !== idAtivo,
    );
    const indice = vizinhos.findIndex((c) => c.id === idSobre);
    return {
      listaId: alvo.list_id,
      indice: indice < 0 ? vizinhos.length : indice,
      vizinhos,
    };
  }

  function aoComecar(evento: DragStartEvent) {
    const tipo =
      evento.active.data.current?.tipo === "lista" ? "lista" : "cartao";
    const cartao = estado.cartoes.find((c) => c.id === evento.active.id);
    definirArrasto({
      id: String(evento.active.id),
      tipo,
      origem: cartao
        ? { list_id: cartao.list_id, posicao: cartao.posicao }
        : null,
    });
  }

  /**
   * Passagem entre colunas.
   *
   * O cartão muda de lista já aqui, e não só ao largar: é o que faz a coluna de
   * destino abrir espaço debaixo do cursor em vez de o cartão só lá aparecer no
   * fim. A posição atribuída é real, por isso o estado nunca fica inválido a
   * meio do gesto.
   */
  function aoPassarPor(evento: DragOverEvent) {
    const { active, over } = evento;
    if (!over || active.data.current?.tipo === "lista") return;

    const idAtivo = String(active.id);
    const cartao = estado.cartoes.find((c) => c.id === idAtivo);
    if (!cartao) return;

    const destino = destinoDe(idAtivo, String(over.id));
    if (!destino || destino.listaId === cartao.list_id) return;

    despachar({
      tipo: "cartao:alterar",
      id: idAtivo,
      campos: {
        list_id: destino.listaId,
        posicao: posicaoNoIndice(
          destino.vizinhos.map((c) => c.posicao),
          destino.indice,
        ),
      },
    });
  }

  function aoLargar(evento: DragEndEvent) {
    const emCurso = arrasto;
    definirArrasto(null);

    const { active, over } = evento;
    if (!over || !emCurso) return;

    if (emCurso.tipo === "lista") {
      void largarLista(String(active.id), String(over.id));
      return;
    }
    void largarCartao(String(active.id), String(over.id), emCurso.origem);
  }

  async function largarCartao(
    idCartao: string,
    idSobre: string,
    origem: Arrasto["origem"],
  ) {
    const destino = destinoDe(idCartao, idSobre);
    if (!destino) return;

    const posicao = posicaoNoIndice(
      destino.vizinhos.map((c) => c.posicao),
      destino.indice,
    );

    // Largado onde estava: não vale uma ida ao servidor.
    if (
      origem &&
      destino.listaId === origem.list_id &&
      posicao === origem.posicao
    ) {
      return;
    }

    // Otimista: o cartão fica onde foi largado antes de a rede responder.
    despachar({
      tipo: "cartao:alterar",
      id: idCartao,
      campos: { list_id: destino.listaId, posicao },
    });

    try {
      const posicaoFinal = await mutar.moverCartao(
        idCartao,
        destino.listaId,
        posicao,
      );

      // O servidor reequilibrou: as posições de toda a lista mudaram e as que
      // temos em memória ficaram para trás.
      if (posicaoFinal !== posicao) {
        await sincronizarPosicoes([destino.listaId]);
      }
    } catch (erro) {
      if (origem) {
        despachar({ tipo: "cartao:alterar", id: idCartao, campos: origem });
      }
      avisar.falhou(mensagem(erro));
    }
  }

  async function largarLista(idLista: string, idSobre: string) {
    if (idLista === idSobre) return;

    const ordenadas = listas.filter((l) => l.id !== idLista);
    const indice = ordenadas.findIndex((l) => l.id === idSobre);
    const posicao = posicaoNoIndice(
      ordenadas.map((l) => l.posicao),
      indice < 0 ? ordenadas.length : indice,
    );

    const anterior = estado.listas.find((l) => l.id === idLista)?.posicao;
    despachar({ tipo: "lista:alterar", id: idLista, campos: { posicao } });

    try {
      await mutar.moverLista(idLista, posicao);
    } catch (erro) {
      if (anterior != null) {
        despachar({
          tipo: "lista:alterar",
          id: idLista,
          campos: { posicao: anterior },
        });
      }
      avisar.falhou(mensagem(erro));
    }
  }

  async function sincronizarPosicoes(idsListas: string[]) {
    try {
      const posicoes = await mutar.relerPosicoes(idsListas);
      despachar({ tipo: "cartoes:reposicionar", posicoes });
    } catch {
      // Sem drama: o Realtime traz as posições novas de qualquer maneira.
    }
  }

  /* ------------------------------------------------------------ atalhos -- */

  useAtalhos({
    aoPesquisar: () => document.getElementById(ID_CAMPO_PESQUISA)?.focus(),
    aoLimparFiltros: () => definirFiltros(FILTROS_VAZIOS),
    aoFechar: () => definirCartaoAberto(null),
    aoNovaLista: () => document.getElementById(ID_BOTAO_NOVA_LISTA)?.click(),
    ativo: !cartaoAberto,
  });

  /* ------------------------------------------------------------- render -- */

  const cartaoEmArrasto =
    arrasto?.tipo === "cartao"
      ? estado.cartoes.find((c) => c.id === arrasto.id)
      : undefined;
  const listaEmArrasto =
    arrasto?.tipo === "lista"
      ? estado.listas.find((l) => l.id === arrasto.id)
      : undefined;

  const detalhe = cartaoAberto
    ? estado.cartoes.find((c) => c.id === cartaoAberto)
    : undefined;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <BarraQuadro
          estado={estado}
          papel={dados.papel}
          utilizador={utilizador}
          filtros={filtros}
          aoMudarFiltros={definirFiltros}
          despachar={despachar}
        />

        <DndContext
          sensors={sensores}
          collisionDetection={closestCorners}
          onDragStart={aoComecar}
          onDragOver={aoPassarPor}
          onDragEnd={aoLargar}
          onDragCancel={() => definirArrasto(null)}
          accessibility={{ announcements: anuncios }}
        >
          {/*
            A imagem de destaque do cliente, atrás das colunas.

            Fica em `fixed` por baixo de tudo e não como fundo do contentor que
            rola: senão a fotografia deslizava com as colunas ao arrastar o
            quadro na horizontal. O véu por cima é o que garante contraste — a
            legibilidade das colunas não pode depender de que fotografia é.
          */}
          {dados.quadro.imagem && (
            <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
              <div
                className="size-full bg-cover bg-center"
                style={{ backgroundImage: `url(${dados.quadro.imagem})` }}
              />
              <div
                className={cn(
                  "absolute inset-0",
                  dados.quadro.brilho_fundo === "escuro"
                    ? "bg-[var(--cor-fundo)]/70"
                    : "bg-[var(--cor-fundo)]/80",
                )}
              />
            </div>
          )}

          <div
            id="conteudo"
            className="barra-fina flex min-h-0 flex-1 items-start gap-3 overflow-x-auto p-3 sm:gap-4 sm:p-4"
          >
            <SortableContext
              items={listas.map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {listas.map((lista) => (
                <Coluna
                  key={lista.id}
                  lista={lista}
                  cartoes={cartoesPorLista.get(lista.id) ?? []}
                  etiquetas={estado.etiquetas}
                  membros={estado.membros}
                  editavel={editavel}
                  utilizador={utilizador}
                  despachar={despachar}
                  aoAbrirCartao={definirCartaoAberto}
                  totalNaLista={
                    estado.cartoes.filter(
                      (c) => c.list_id === lista.id && !c.arquivado,
                    ).length
                  }
                />
              ))}
            </SortableContext>

            {editavel && (
              <NovaColuna
                idQuadro={dados.quadro.id}
                listas={estado.listas}
                despachar={despachar}
              />
            )}

            {listas.length === 0 && !editavel && (
              <p className="p-4 text-sm text-texto-suave">
                Este quadro ainda não tem listas.
              </p>
            )}
          </div>

          <DragOverlay
            dropAnimation={{
              duration: 170,
              easing: "cubic-bezier(0.2, 0, 0.1, 1)",
            }}
          >
            {cartaoEmArrasto && (
              <CartaoMini
                cartao={cartaoEmArrasto}
                etiquetas={estado.etiquetas}
                membros={estado.membros}
                aoAbrir={() => {}}
                aSerArrastado
              />
            )}
            {listaEmArrasto && (
              <div className="w-72 rounded-lg border border-borda-forte bg-superficie-2 p-2 opacity-90 shadow-xl">
                <p className="px-1 py-0.5 text-sm font-semibold">
                  {listaEmArrasto.nome}
                </p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      {detalhe && (
        <DetalheCartao
          cartao={detalhe}
          estado={estado}
          papel={dados.papel}
          utilizador={utilizador}
          despachar={despachar}
          aoFechar={() => definirCartaoAberto(null)}
        />
      )}
    </>
  );
}

function mensagem(erro: unknown) {
  return erro instanceof Error
    ? erro.message
    : "Não foi possível guardar a alteração. Tenta outra vez.";
}

/** Leitor de ecrã: o arrasto tem de ser narrado, não só visto. */
const anuncios: Announcements = {
  onDragStart: ({ active }) =>
    `Agarrou ${active.data.current?.nome ?? "o item"}.`,
  onDragOver: ({ active, over }) =>
    over
      ? `${active.data.current?.nome ?? "O item"} está sobre ${over.data.current?.nome ?? "outra posição"}.`
      : undefined,
  onDragEnd: ({ active, over }) =>
    over
      ? `${active.data.current?.nome ?? "O item"} foi largado em ${over.data.current?.nome ?? "nova posição"}.`
      : `${active.data.current?.nome ?? "O item"} voltou ao sítio.`,
  onDragCancel: ({ active }) =>
    `Arrasto cancelado. ${active.data.current?.nome ?? "O item"} voltou ao sítio.`,
};
