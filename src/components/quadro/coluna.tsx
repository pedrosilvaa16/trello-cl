"use client";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { avisar } from "@/components/ui/avisos";
import { Botao } from "@/components/ui/botao";
import { Confirmar, useConfirmacao } from "@/components/ui/confirmar";
import {
  AbrirMenu,
  ConteudoMenu,
  ItemMenu,
  Menu,
  SeparadorMenu,
} from "@/components/ui/menu";
import { posicaoNoIndice, porPosicao } from "@/lib/posicoes";
import type { AccaoQuadro } from "@/lib/quadro/estado";
import * as mutar from "@/lib/quadro/mutacoes";
import type { CartaoCompleto, MembroComPerfil } from "@/lib/quadro/tipos";
import type { Etiqueta, Lista, Perfil } from "@/lib/supabase/tipos";
import { cn } from "@/lib/utils";

import { CartaoArrastavel } from "./cartao-mini";
import { Compositor } from "./compositor";

export function Coluna({
  lista,
  cartoes,
  etiquetas,
  membros,
  editavel,
  utilizador,
  despachar,
  aoAbrirCartao,
  totalNaLista,
}: {
  lista: Lista;
  cartoes: CartaoCompleto[];
  etiquetas: Etiqueta[];
  membros: MembroComPerfil[];
  editavel: boolean;
  utilizador: Perfil;
  despachar: React.Dispatch<AccaoQuadro>;
  aoAbrirCartao: (id: string) => void;
  totalNaLista: number;
}) {
  const [aRenomear, definirARenomear] = React.useState(false);
  const [aAdicionar, definirAAdicionar] = React.useState(false);
  const confirmacao = useConfirmacao();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: lista.id,
      data: { tipo: "lista", nome: lista.nome },
      disabled: !editavel || aRenomear,
    });

  async function criarCartao(titulo: string) {
    const posicao = posicaoNoIndice(
      cartoes.map((c) => c.posicao),
      cartoes.length,
    );
    try {
      const cartao = await mutar.criarCartao(
        lista.id,
        titulo,
        posicao,
        utilizador.id,
      );
      despachar({ tipo: "cartao:inserir", cartao });
    } catch (erro) {
      avisar.falhou(texto(erro));
    }
  }

  async function renomear(nome: string) {
    const anterior = lista.nome;
    despachar({ tipo: "lista:alterar", id: lista.id, campos: { nome } });
    try {
      await mutar.alterarLista(lista.id, { nome });
    } catch (erro) {
      despachar({ tipo: "lista:alterar", id: lista.id, campos: { nome: anterior } });
      avisar.falhou(texto(erro));
    }
  }

  async function arquivar() {
    despachar({ tipo: "lista:alterar", id: lista.id, campos: { arquivada: true } });
    try {
      await mutar.alterarLista(lista.id, { arquivada: true });
      avisar.comAnular(`Lista «${lista.nome}» arquivada.`, async () => {
        despachar({
          tipo: "lista:alterar",
          id: lista.id,
          campos: { arquivada: false },
        });
        await mutar.alterarLista(lista.id, { arquivada: false });
      });
    } catch (erro) {
      despachar({
        tipo: "lista:alterar",
        id: lista.id,
        campos: { arquivada: false },
      });
      avisar.falhou(texto(erro));
    }
  }

  async function apagar() {
    try {
      await mutar.apagarLista(lista.id);
      despachar({ tipo: "lista:remover", id: lista.id });
    } catch (erro) {
      avisar.falhou(texto(erro));
    }
  }

  return (
    <section
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: transition ?? undefined,
      }}
      className={cn(
        "flex max-h-full w-[17rem] shrink-0 flex-col rounded-lg border border-borda bg-superficie-2 sm:w-72",
        isDragging && "opacity-50",
      )}
      aria-label={`Lista ${lista.nome}`}
    >
      <header className="flex items-start gap-1 px-2 pt-2 pb-1">
        {editavel && (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-texto-tenue opacity-0 transition-opacity group-focus-within:opacity-100 hover:bg-superficie-3 focus-visible:opacity-100 active:cursor-grabbing sm:opacity-60"
            aria-label={`Arrastar a lista ${lista.nome}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" aria-hidden />
          </button>
        )}

        {aRenomear ? (
          <div className="flex-1">
            <Compositor
              valorInicial={lista.nome}
              placeholder="Nome da lista"
              rotuloGuardar="Guardar nome"
              multiplasLinhas={false}
              aoGuardar={renomear}
              aoFechar={() => definirARenomear(false)}
            />
          </div>
        ) : (
          <>
            <h2 className="min-w-0 flex-1 px-1 py-0.5 text-sm leading-snug font-semibold text-texto">
              <button
                type="button"
                className="max-w-full text-left break-words disabled:cursor-default"
                onClick={() => editavel && definirARenomear(true)}
                disabled={!editavel}
                title={editavel ? "Mudar o nome da lista" : undefined}
              >
                {lista.nome}
              </button>
            </h2>

            <span
              className="mt-1 shrink-0 text-xs text-texto-tenue"
              data-numerico
              title={`${totalNaLista} ${totalNaLista === 1 ? "cartão" : "cartões"}`}
            >
              {cartoes.length === totalNaLista
                ? totalNaLista
                : `${cartoes.length}/${totalNaLista}`}
            </span>

            {editavel && (
              <Menu>
                <AbrirMenu asChild>
                  <Botao
                    variante="fantasma"
                    tamanho="iconePequeno"
                    aria-label={`Ações da lista ${lista.nome}`}
                  >
                    <MoreHorizontal />
                  </Botao>
                </AbrirMenu>
                <ConteudoMenu>
                  <ItemMenu onSelect={() => definirARenomear(true)}>
                    Mudar o nome
                  </ItemMenu>
                  <ItemMenu onSelect={arquivar}>
                    <Archive /> Arquivar lista
                  </ItemMenu>
                  <SeparadorMenu />
                  <ItemMenu perigoso onSelect={confirmacao.abrir}>
                    <Trash2 /> Apagar lista
                  </ItemMenu>
                </ConteudoMenu>
              </Menu>
            )}
          </>
        )}
      </header>

      <div className="barra-fina min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 py-1">
        <SortableContext
          items={cartoes.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cartoes.map((cartao) => (
            <CartaoArrastavel
              key={cartao.id}
              cartao={cartao}
              etiquetas={etiquetas}
              membros={membros}
              editavel={editavel}
              aoAbrir={aoAbrirCartao}
              aoAlternarConcluido={async (id, concluido) => {
                despachar({ tipo: "cartao:alterar", id, campos: { concluido } });
                try {
                  await mutar.alterarCartao(id, { concluido });
                } catch (erro) {
                  despachar({
                    tipo: "cartao:alterar",
                    id,
                    campos: { concluido: !concluido },
                  });
                  avisar.falhou(texto(erro));
                }
              }}
            />
          ))}
        </SortableContext>

        {cartoes.length === 0 && !aAdicionar && (
          <p className="px-1 py-3 text-xs text-texto-tenue">
            {totalNaLista > 0
              ? "Nenhum cartão corresponde ao filtro."
              : "Ainda sem cartões."}
          </p>
        )}
      </div>

      {editavel && (
        <footer className="p-2 pt-1">
          {aAdicionar ? (
            <Compositor
              placeholder="Título do cartão"
              rotuloGuardar="Adicionar cartão"
              continuar
              aoGuardar={criarCartao}
              aoFechar={() => definirAAdicionar(false)}
            />
          ) : (
            <Botao
              variante="fantasma"
              tamanho="pequeno"
              className="w-full justify-start"
              onClick={() => definirAAdicionar(true)}
            >
              <Plus /> Adicionar cartão
            </Botao>
          )}
        </footer>
      )}

      <Confirmar
        aberto={confirmacao.aberto}
        aoMudarAberto={confirmacao.definirAberto}
        titulo={`Apagar a lista «${lista.nome}»?`}
        descricao={
          totalNaLista > 0
            ? `Os ${totalNaLista} cartões desta lista são apagados com ela, e não há como os recuperar. Para os guardar, arquiva a lista em vez de a apagares.`
            : "A lista é apagada e não há como a recuperar."
        }
        rotuloAcao="Apagar lista"
        perigoso
        aoConfirmar={apagar}
      />
    </section>
  );
}

/** O atalho `n` carrega neste botão. Ver ID_CAMPO_PESQUISA em filtros.tsx. */
export const ID_BOTAO_NOVA_LISTA = "botao-nova-lista";

/** Coluna nova, no fim do quadro. */
export function NovaColuna({
  idQuadro,
  listas,
  despachar,
}: {
  idQuadro: string;
  listas: Lista[];
  despachar: React.Dispatch<AccaoQuadro>;
}) {
  const [aberto, definirAberto] = React.useState(false);

  async function criar(nome: string) {
    const ativas = listas
      .filter((l) => !l.arquivada)
      .slice()
      .sort(porPosicao);
    const posicao = posicaoNoIndice(
      ativas.map((l) => l.posicao),
      ativas.length,
    );
    try {
      const lista = await mutar.criarLista(idQuadro, nome, posicao);
      despachar({ tipo: "lista:upsert", lista });
    } catch (erro) {
      avisar.falhou(texto(erro));
    }
  }

  return (
    <div className="w-[17rem] shrink-0 sm:w-72">
      {aberto ? (
        <div className="rounded-lg border border-borda bg-superficie-2 p-2">
          <Compositor
            placeholder="Nome da lista"
            rotuloGuardar="Adicionar lista"
            multiplasLinhas={false}
            continuar
            aoGuardar={criar}
            aoFechar={() => definirAberto(false)}
          />
        </div>
      ) : (
        <Botao
          id={ID_BOTAO_NOVA_LISTA}
          variante="fantasma"
          className="w-full justify-start border border-dashed border-borda-forte"
          onClick={() => definirAberto(true)}
        >
          <Plus /> Adicionar lista
        </Botao>
      )}
    </div>
  );
}

function texto(erro: unknown) {
  return erro instanceof Error
    ? erro.message
    : "Não foi possível guardar a alteração.";
}
